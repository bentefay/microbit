#include <assert.h>
#include "settings_logic.h"
#include "settings_display.h"
#include "settings_rumble.h"
#include "audio_logic.h"
#include "motor_control.h"
static const uint8_t blue[6]={0x5c,0xba,0x37,0xdd,0xd9,0x6c};
static const uint8_t eli[6]={0x5c,0xba,0x37,0x67,0x7f,0xda};
static settings_event_t press(settings_ui_t *s,uint8_t key,uint32_t time) {
    settings_keys(s,blue,0,time);
    return settings_keys(s,blue,key,time);
}
int main(void) {
    settings_ui_t s={.live=settings_defaults(359),.saved=settings_defaults(359)};
    assert(settings_keys(&s,eli,SET_MENU_KEY,0)==SET_NONE && !s.seen[0] && s.seen[1]);
    assert(settings_keys(&s,blue,SET_MENU_KEY|SET_UP_KEY,0)==SET_NONE);
    assert(settings_keys(&s,blue,SET_MENU_KEY|SET_UP_KEY,1000)==SET_NONE && !s.active);
    assert(press(&s,SET_MENU_KEY,1001)==SET_ENTER && s.active && s.selected==0);
    assert(settings_keys(&s,blue,SET_MENU_KEY,1100)==SET_NONE);
    assert(press(&s,SET_UP_KEY,1200)==SET_UP && s.live.speed==25);
    assert(settings_repeat(&s,1599,true)==SET_NONE);
    assert(settings_repeat(&s,1600,true)==SET_UP && s.live.speed==30);
    assert(settings_repeat(&s,1749,true)==SET_NONE);
    assert(settings_repeat(&s,1750,true)==SET_UP && s.live.speed==35);
    assert(settings_repeat(&s,1900,false)==SET_NONE);
    assert(settings_repeat(&s,5000,true)==SET_NONE); // fresh peer reply must not restart expired repeat
    assert(press(&s,SET_RIGHT_KEY,5000)==SET_SELECT && s.selected==1);
    assert(press(&s,SET_UP_KEY,5001)==SET_UP && s.live.center==1);
    assert(press(&s,SET_DOWN_KEY,5002)==SET_DOWN && s.live.center==359);
    assert(press(&s,SET_RIGHT_KEY,5003)==SET_SELECT && s.selected==2);
    for (unsigned i=0;i<7;i++) assert(press(&s,SET_UP_KEY,5010+i)==SET_UP);
    assert(s.live.range==80 && press(&s,SET_UP_KEY,5020)==SET_LIMIT);
    for (unsigned i=0;i<15;i++) assert(press(&s,SET_DOWN_KEY,5030+i)==SET_DOWN);
    assert(s.live.range==5 && press(&s,SET_DOWN_KEY,5050)==SET_LIMIT);
    assert(press(&s,SET_RIGHT_KEY,5051)==SET_SELECT && s.selected==0);
    assert(press(&s,SET_LEFT_KEY,5052)==SET_SELECT && s.selected==2);
    assert(press(&s,SET_VIEW_KEY,5053)==SET_CANCEL && !s.active && settings_equal(s.live,s.saved));
    assert(press(&s,SET_MENU_KEY,5054)==SET_ENTER && s.selected==0);
    for (unsigned i=0;i<16;i++) press(&s,SET_UP_KEY,5060+i);
    assert(s.live.speed==100 && press(&s,SET_UP_KEY,5080)==SET_LIMIT);
    assert(press(&s,SET_MENU_KEY,5081)==SET_SAVE && s.saved.speed==100 && !s.active);
    press(&s,SET_MENU_KEY,5082); press(&s,SET_DOWN_KEY,5083);
    assert(settings_cancel(&s)==SET_CANCEL && s.live.speed==100);
    s.seen[0]=false;
    assert(settings_keys(&s,blue,SET_MENU_KEY,6000)==SET_NONE && !s.active);
    press(&s,SET_MENU_KEY,6001);
    press(&s,SET_DOWN_KEY,0xffffff00u);
    assert(settings_repeat(&s,0x8fu,true)==SET_NONE);
    assert(settings_repeat(&s,0x90u,true)==SET_DOWN);
    assert(settings_keys(&s,eli,SET_VIEW_KEY,0x91u)==SET_NONE && s.active);
    press(&s,SET_UP_KEY|SET_DOWN_KEY,0x92u);
    assert(settings_repeat(&s,1000,true)==SET_NONE);

    uint8_t record[SETTINGS_BYTES]; motor_settings_t decoded;
    motor_settings_t value={100,1,80}; settings_encode(value,359,record);
    assert(settings_decode(record,sizeof(record),359,&decoded) && settings_equal(value,decoded));
    assert(settings_decode(record,sizeof(record),89,&decoded) && decoded.center==91); // explicit offset reference
    assert(!settings_decode(record,9,359,&decoded));
    for (unsigned i=0;i<SETTINGS_BYTES;i++) for (unsigned bit=0;bit<8;bit++) {
        record[i]^=1u<<bit; assert(!settings_decode(record,sizeof(record),359,&decoded)); record[i]^=1u<<bit;
    }
    value.speed=101; settings_encode(value,0,record); assert(!settings_decode(record,sizeof(record),0,&decoded));
    value=(motor_settings_t){20,359,85}; settings_encode(value,0,record); assert(!settings_decode(record,sizeof(record),0,&decoded));
    assert(settings_crc((const uint8_t *)"123456789",9)==0xcbf43926u);

    uint8_t frame[25]; s.selected=0; s.live.speed=100;
    assert(settings_frame(&s,0,false,frame));
    for (unsigned i=0;i<25;i++) assert(frame[i]==0);
    assert(settings_frame(&s,1000,false,frame));
    assert(frame[5]==180 && frame[0]==0); // first S column
    assert(!settings_frame(&s,1000,true,frame));
    for (unsigned i=0;i<25;i++) assert(frame[i]==180);
    assert(!settings_frame(&s,10000,false,frame));
    assert(settings_frame(&s,6999,false,frame)); // SPEED now scrolls for 7 s
    assert(!settings_frame(&s,7000,false,frame));
    s.selected=1; s.live.center=0; settings_frame(&s,0,true,frame);
    for (unsigned i=0;i<25;i++) assert(frame[i]==0);
    for (unsigned event=SET_ENTER;event<=SET_CANCEL;event++) {
        const uint8_t *packet=settings_rumble_report(event);
        assert(packet[3]<=100 && packet[4]<=100 && packet[5]>0 && packet[5]<=25);
        for (unsigned i=0;i<10000;i++) assert(audio_tone(event,i)>=-55 && audio_tone(event,i)<=55);
        assert(audio_tone(event,16000)==0);
    }

    drive_control_t control={0}; drive_input_t input={.present=true,.received=1};
    drive_configure(&control,20,359,45); drive_plan(&control,&input,1);
    input.y=-512; input.x=511;
    drive_plan(&control,&input,1); assert(control.speed==20 && control.target==44);
    drive_configure(&control,25,1,80);
    drive_plan_t plan=drive_plan(&control,&input,1);
    assert(plan.speed && plan.target && control.speed==25 && control.target==81);
    drive_configure(&control,25,1,80); plan=drive_plan(&control,&input,1);
    assert(!plan.speed && !plan.target);
    input.y=input.x=0; drive_plan(&control,&input,1);
    drive_configure(&control,30,1,75); plan=drive_plan(&control,&input,1);
    assert(plan.speed && plan.target && control.speed==0 && control.target==1);
    input.abort=true; drive_plan(&control,&input,1);
    drive_configure(&control,100,180,80); input.abort=false; plan=drive_plan(&control,&input,1);
    assert(control.mode==DRIVE_ABORTED && !plan.speed && !plan.target);

    for (int editor=0;editor<2;editor++) {
        const uint8_t *pad=editor?eli:blue, *other=editor?blue:eli;
        s=(settings_ui_t){.live=settings_defaults(0),.saved=settings_defaults(0)};
        settings_keys(&s,pad,0,0); settings_keys(&s,other,0,0);
        assert(settings_keys(&s,pad,SET_MENU_KEY,1)==SET_ENTER && s.editor==editor);
        assert(settings_keys(&s,other,SET_MENU_KEY,2)==SET_NONE && s.active);
        assert(settings_keys(&s,other,SET_UP_KEY,3)==SET_NONE && s.live.speed==20);
        assert(settings_keys(&s,pad,SET_UP_KEY,4)==SET_UP && s.live.speed==25);
        assert(settings_keys(&s,other,SET_VIEW_KEY,5)==SET_NONE && s.active);
        assert(settings_leave(&s,other)==SET_NONE && s.active);
        assert(settings_keys(&s,pad,SET_MENU_KEY,6)==SET_SAVE && s.saved.speed==25);
        settings_keys(&s,pad,0,7); settings_keys(&s,pad,SET_MENU_KEY,8);
        settings_keys(&s,pad,SET_DOWN_KEY,9);
        assert(settings_leave(&s,pad)==SET_CANCEL && !s.active && s.live.speed==25);
        assert(settings_keys(&s,pad,SET_MENU_KEY,10)==SET_NONE && !s.active); // reconnect-held
    }
}
