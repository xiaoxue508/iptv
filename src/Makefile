CC ?= gcc
CFLAGS ?= -O2 -std=gnu99 -Wall -Wextra
LDLIBS ?= -lcurl -lpthread

OBJS := $(patsubst %.c,%.o,$(wildcard *.c))

all: iptvd

iptvd: $(OBJS)
	$(CC) $(LDFLAGS) -o $@ $(OBJS) $(LDLIBS)

%.o: %.c
	$(CC) $(CFLAGS) -c -o $@ $<

clean:
	rm -f *.o iptvd

.PHONY: all clean
