#include "hmi.h"

static void display_set_window(uint16_t x0,uint16_t y0,uint16_t x1,uint16_t y1);
static void display_write_rgb565(const uint16_t *pixels,uint32_t count);

static void display_flush(uint16_t x,uint16_t y,uint16_t width,uint16_t height,
                          const uint16_t *rgb565,uint16_t stride,void *user){
    uint16_t row;(void)user;
    display_set_window(x,y,(uint16_t)(x+width-1u),(uint16_t)(y+height-1u));
    if(stride==width)display_write_rgb565(rgb565,(uint32_t)width*height);
    else for(row=0;row<height;row++)display_write_rgb565(rgb565+(uint32_t)row*stride,width);
}

void application_draw(HmiState *state){hmi_invalidate_all();hmi_render_dirty(state,display_flush,NULL);}

static void display_set_window(uint16_t x0,uint16_t y0,uint16_t x1,uint16_t y1){(void)x0;(void)y0;(void)x1;(void)y1;}
static void display_write_rgb565(const uint16_t *pixels,uint32_t count){(void)pixels;(void)count;}
