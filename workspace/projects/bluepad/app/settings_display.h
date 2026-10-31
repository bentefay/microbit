#ifndef SETTINGS_DISPLAY_H
#define SETTINGS_DISPLAY_H
#include "settings_logic.h"
#define SETTINGS_SCROLL_COLUMN_MS 200u
static inline const char *settings_name(unsigned selected) {
    return selected == 0 ? "SPEED" : selected == 1 ? "STEERING CENTRE" : "STEERING RANGE";
}
static inline uint8_t settings_column(char c, unsigned col) {
    // Five columns, bit zero at top. Only the letters used in setting names.
    static const char letters[] = "SPEDTRINGCA";
    static const uint8_t font[][5] = {
        {18,21,21,21,9}, {31,5,5,5,2}, {31,21,21,21,17}, {31,17,17,10,4},
        {1,1,31,1,1}, {31,5,13,21,18}, {17,17,31,17,17},
        {31,2,4,8,31}, {14,17,21,21,28}, {14,17,17,17,10}, {30,5,5,5,30}
    };
    for (unsigned i=0;i<sizeof(letters)-1;i++) if (letters[i]==c) return font[i][col];
    return 0;
}
static inline bool settings_frame(settings_ui_t *s, uint32_t elapsed, bool skip, uint8_t frame[25]) {
    memset(frame,0,25);
    const char *name=settings_name(s->selected);
    unsigned length=(unsigned)strlen(name), shift=elapsed/SETTINGS_SCROLL_COLUMN_MS;
    if (!skip && shift < length*6+5) {
        for (unsigned x=0;x<5;x++) {
            int column=(int)shift+(int)x-5;
            if (column<0 || (unsigned)column>=length*6 || column%6==5) continue;
            uint8_t bits=settings_column(name[column/6],(unsigned)column%6);
            for (unsigned y=0;y<5;y++) if (bits & (1u<<y)) frame[y*5+x]=180;
        }
        return true;
    }
    int value=s->selected==0?s->live.speed:s->selected==1?s->live.center:s->live.range;
    int max=s->selected==0?100:s->selected==1?359:360;
    unsigned count=(unsigned)((value*25+max/2)/max);
    for (unsigned i=0;i<count;i++) frame[(4-i/5)*5+i%5]=180;
    return false;
}
#endif
