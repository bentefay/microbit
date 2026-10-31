#ifndef TEST_IRQ_H
#define TEST_IRQ_H
#define IRQ_CONNECT(number, priority, handler, arg, flags) ((void)(handler))
static inline unsigned irq_lock(void) { return 0; }
static inline void irq_unlock(unsigned key) { (void)key; }
static inline void irq_enable(unsigned number) { (void)number; }
#endif
