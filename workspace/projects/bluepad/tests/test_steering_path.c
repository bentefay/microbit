#include <assert.h>
#include <limits.h>
#include "steering_path.h"
static void sweep(steering_path_t *s, int64_t demand) {
    int angle=0;
    for (unsigned i=0;i<600 && s->position_tenths!=demand*10;i++) {
        if (steering_next(s,demand,false,&angle)) {
            int64_t delta=s->waypoint*10-s->position_tenths;
            assert(delta>=-610 && delta<=610);
            assert(angle==drive_angle((int)(s->waypoint%360)));
        }
        int delta=(int)(s->waypoint*10-s->position_tenths);
        delta=delta>30?30:delta< -30?-30:delta;
        assert(steering_sample(s,s->raw+delta,s->sampled+50));
    }
    assert(s->position_tenths==demand*10);
}
int main(void) {
    drive_control_t c={0}; drive_input_t in={.present=true,.received=10};
    drive_configure(&c,20,0,360); drive_plan(&c,&in,10);
    steering_path_t s=steering_begin(0,0,10);
    in.x=-512; drive_plan(&c,&in,10);
    assert(c.target_path==-360 && c.target==0);
    sweep(&s,c.target_path);
    in.x=511; assert(drive_plan(&c,&in,10).target);
    assert(c.target_path==360 && c.target==0); // same wrapped angle, 720-degree travel
    sweep(&s,c.target_path);
    in.x=0; drive_plan(&c,&in,10); sweep(&s,c.target_path);
    int angle;
    assert(steering_next(&s,360,false,&angle) && angle==60);
    for (unsigned i=0;i<100;i++) assert(!steering_next(&s,360,false,&angle)); // stalled shaft never advances
    assert(steering_sample(&s,200,s.sampled+50));
    assert(steering_next(&s,-360,false,&angle) && angle==320); // reverse from measured +20, not commanded +60
    sweep(&s,-360);
    assert(!steering_sample(&s,s.raw+901,s.sampled+50));
    assert(!steering_sample(&s,INT_MAX,s.sampled+50));
    assert(!steering_sample(&s,INT_MIN,s.sampled+50));
    assert(steering_fresh(&s,s.sampled+150) && !steering_fresh(&s,s.sampled+151));
    s.sampled=0xfffffff0u; assert(steering_fresh(&s,10));
    c=(drive_control_t){.center=359};
    drive_configure(&c,20,1,45); in.x=0; drive_plan(&c,&in,10);
    assert(c.target_path==361 && c.target==1);
    drive_configure(&c,20,359,45); drive_plan(&c,&in,10);
    assert(c.target_path==359); // wrapped centre edits remain small movements
    s=steering_begin(-10,359,0); assert(steering_sample(&s,10,50));
    assert(s.position_tenths==3610); // raw cumulative crossing through zero
    s.issued=false; assert(steering_next(&s,359,true,&angle) && angle==359);
}
