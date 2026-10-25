#include <assert.h>
#include <limits.h>
#include <string.h>
#include "nezha_packet.h"
int main(void) {
 uint8_t p[8];
 const uint8_t forward[8]={0xff,0xf9,1,1,0x60,25,0xf5,0};
 const uint8_t reverse[8]={0xff,0xf9,4,2,0x60,100,0xf5,0};
 const uint8_t stopped[8]={0xff,0xf9,2,0,0x5f,0,0xf5,0};
 assert(nezha_motor_packet(1,25,p) && memcmp(p,forward,8)==0);
 assert(nezha_motor_packet(4,INT_MIN,p) && memcmp(p,reverse,8)==0);
 assert(nezha_motor_packet(2,0,p) && memcmp(p,stopped,8)==0);
 assert(nezha_motor_packet(1,INT_MAX,p) && p[3]==1 && p[5]==100);
 assert(!nezha_motor_packet(0,10,p)); assert(!nezha_motor_packet(5,10,p));
 assert(!nezha_motor_packet(1,10,NULL));
 return 0;
}
