#include <zephyr/sys/printk.h>
#include <btstack_tlv.h>
#include <btstack_run_loop.h>
#include "settings.h"
#include "settings_display.h"
#include "settings_audio.h"
#include "joystick_matrix.h"
#include "motor_drive.h"

static settings_ui_t ui;
static motor_settings_t persisted;
static bool initialized, reset_defaults, dirty, requested, skip_scroll, retry_pending;
static int boot_center;
static int32_t boot_raw;
static uint32_t scroll_started, rumble_deadline, last_status, retry_at;
static settings_event_t rumble;
static const btstack_tlv_t *tlv;
static void *tlv_context;
static void status(uint32_t now, const char *event) {
    printk("BP_SETTINGS,%u,%s,%u,%u,%d,%d,%d,%u\n",now,event,ui.active,ui.selected,
        ui.live.speed,ui.live.center,ui.live.range,dirty);
}
static void feedback(settings_event_t event, uint32_t now) {
    if (event==SET_NONE) return;
    static const char *const names[]={"none","enter","select","up","down","limit","save","cancel"};
    if (event==SET_ENTER || event==SET_SELECT) { scroll_started=now; skip_scroll=false; }
    if (event==SET_UP || event==SET_DOWN || event==SET_LIMIT) skip_scroll=true;
    if (event==SET_SAVE) dirty=!settings_equal(ui.saved,persisted);
    motor_drive_settings(ui.live);
    settings_audio(event,ui.selected);
    rumble=event; rumble_deadline=now+500;
    status(now,names[event]);
}
void settings_init(bool factory_reset) {
    reset_defaults=factory_reset;
    btstack_tlv_get_instance(&tlv,&tlv_context);
}
bool settings_active(void) { return initialized && ui.active; }
void settings_input(const uint8_t address[6], uint8_t dpad, uint8_t misc, uint32_t now) {
    if (!initialized) return;
    uint8_t keys=(dpad&15) | ((misc&4)?SET_MENU_KEY:0) | ((misc&2)?SET_VIEW_KEY:0);
    feedback(settings_keys(&ui,address,keys,now),now);
}
void settings_disconnect(const uint8_t address[6]) {
    if (!controller_is_supervisor(address)) return;
    feedback(settings_cancel(&ui),btstack_run_loop_get_time_ms());
    ui.seen=false; ui.held=ui.blocked=0; rumble=SET_NONE;
}
settings_event_t settings_rumble_pending(uint32_t now) {
    if ((int32_t)(now-rumble_deadline)>=0) rumble=SET_NONE;
    return rumble;
}
void settings_rumble_sent(void) { rumble=SET_NONE; }
void settings_tick(uint32_t now, bool blue_fresh) {
    if (!initialized) {
        if (!motor_drive_boot(&boot_center,&boot_raw)) return;
        motor_settings_t loaded=settings_defaults(boot_center);
        uint8_t record[SETTINGS_BYTES];
        // get_tag(buffer) returns bytes copied, not the stored record length.
        // Query length first to reject a valid prefix of an oversized record.
        int size=tlv->get_tag(tlv_context,SETTINGS_TAG,NULL,0);
        bool valid=size==SETTINGS_BYTES &&
            tlv->get_tag(tlv_context,SETTINGS_TAG,record,sizeof(record))==SETTINGS_BYTES &&
            settings_decode(record,(unsigned)size,boot_center,&loaded);
        persisted=loaded;
        ui.live=ui.saved=reset_defaults?settings_defaults(boot_center):loaded;
        dirty=reset_defaults && (!valid || !settings_equal(ui.live,persisted));
        initialized=true;
        motor_drive_settings(ui.live);
        status(now,reset_defaults?"factory-reset":valid?"loaded":"defaults");
        if (reset_defaults) settings_audio(SET_SAVE,0);
    }
    feedback(settings_repeat(&ui,now,blue_fresh),now);
    if (ui.active) {
        uint8_t frame[25]; settings_frame(&ui,now-scroll_started,skip_scroll,frame);
        joystick_matrix_frame(frame);
    }
    // Do not write an earlier accepted save while the user is editing again.
    if (retry_pending && (int32_t)(now-retry_at)>=0) retry_pending=false;
    if (dirty && !ui.active && !retry_pending) {
        if (!requested && !motor_drive_save_ready()) {
            motor_drive_save_request(true); requested=true;
        }
        if (requested && motor_drive_save_ready()) {
            uint8_t record[SETTINGS_BYTES], verify[SETTINGS_BYTES];
            settings_encode(ui.saved,boot_center,record);
            int rc=tlv->store_tag(tlv_context,SETTINGS_TAG,record,sizeof(record));
            bool ok=rc==0 && tlv->get_tag(tlv_context,SETTINGS_TAG,NULL,0)==SETTINGS_BYTES &&
                tlv->get_tag(tlv_context,SETTINGS_TAG,verify,sizeof(verify))==SETTINGS_BYTES &&
                memcmp(record,verify,sizeof(record))==0;
            if (ok) { persisted=ui.saved; dirty=false; }
            else { retry_at=now+5000; retry_pending=true; }
            status(now,ok?"stored":"store-error");
            motor_drive_save_request(false); requested=false;
        }
    } else if (requested) { motor_drive_save_request(false); requested=false; }
    if ((uint32_t)(now-last_status)>=1000) {
        last_status=now; status(now,"status");
        printk("BP_ENCODER,%u,%d,%d\n",now,boot_raw,boot_center);
        printk("BP_AUDIO,%u,status,%d,16000\n",now,settings_audio_status());
    }
}
