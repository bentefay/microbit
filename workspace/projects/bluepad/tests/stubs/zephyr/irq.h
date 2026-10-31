#ifndef TEST_IRQ_H
#define TEST_IRQ_H
#define IRQ_CONNECT(number, priority, handler, arg, flags) ((void)(handler))
unsigned irq_lock(void);
void irq_unlock(unsigned key);
void irq_enable(unsigned number);
void irq_disable(unsigned number);
#endif
