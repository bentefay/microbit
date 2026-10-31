#ifndef TEST_KERNEL_H
#define TEST_KERNEL_H
#include <stdbool.h>
#include <stdint.h>
#include <errno.h>
#define BUILD_ASSERT(condition, message) _Static_assert(condition, message)
#define IS_ENABLED(option) 0
#define K_NO_WAIT 0
#define K_FOREVER -1
#define K_SECONDS(n) ((n)*1000)
struct k_sem { int unused; };
#define K_SEM_DEFINE(name, initial, limit) struct k_sem name
struct k_spinlock { int unused; };
typedef unsigned k_spinlock_key_t;
static inline k_spinlock_key_t k_spin_lock(struct k_spinlock *lock) { (void)lock; return 0; }
static inline void k_spin_unlock(struct k_spinlock *lock,k_spinlock_key_t key) { (void)lock; (void)key; }
int k_sem_take(struct k_sem *sem,int timeout);
void k_sem_give(struct k_sem *sem);
struct k_msgq { unsigned size; bool occupied; unsigned char data[16]; };
#define K_MSGQ_DEFINE(name, item_size, count, alignment) struct k_msgq name={.size=item_size}
#define K_THREAD_DEFINE(...)
int k_msgq_put(struct k_msgq *queue, const void *data, int timeout);
int k_msgq_get(struct k_msgq *queue, void *data, int timeout);
void k_msgq_purge(struct k_msgq *queue);
void k_msleep(int ms);
uint32_t k_uptime_get_32(void);
#endif
