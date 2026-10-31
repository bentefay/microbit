#ifndef TEST_ATOMIC_H
#define TEST_ATOMIC_H
typedef int atomic_t;
static inline int atomic_get(const atomic_t *p) { return *p; }
static inline void atomic_set(atomic_t *p,int value) { *p=value; }
static inline void atomic_inc(atomic_t *p) { ++*p; }
#endif
