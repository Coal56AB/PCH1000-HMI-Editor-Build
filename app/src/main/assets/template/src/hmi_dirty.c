#include "hmi.h"
#include "hmi_gfx.h"

#include <stddef.h>
#include <string.h>

#define HMI_DIRTY_CAPACITY 24u
#define HMI_DIRTY_JOIN_GAP 2u

static HmiRect dirty[HMI_DIRTY_CAPACITY];
static uint8_t dirty_count;
static uint32_t flushed_pixels;

void hmi_draw_generated_scene(HmiSceneId id,uint16_t band_y,uint16_t band_h);
void hmi_draw_dynamic(const HmiState *state);

static uint16_t min16(uint16_t a,uint16_t b){return a<b?a:b;}
static uint16_t max16(uint16_t a,uint16_t b){return a>b?a:b;}
static int strdiff(const char *a,const char *b){if(a==b)return 0;if(!a||!b)return 1;return strcmp(a,b)!=0;}

static HmiRect clamp_rect(HmiRect r) {
    uint32_t x1=(uint32_t)r.x+r.width,y1=(uint32_t)r.y+r.height;
    if(r.x>=320u||r.y>=480u){r.width=0;r.height=0;return r;}
    if(x1>320u)x1=320u;
    if(y1>480u)y1=480u;
    r.width=(uint16_t)(x1-r.x);r.height=(uint16_t)(y1-r.y);return r;
}

static int touches(HmiRect a,HmiRect b) {
    uint32_t ax1=(uint32_t)a.x+a.width+HMI_DIRTY_JOIN_GAP;
    uint32_t ay1=(uint32_t)a.y+a.height+HMI_DIRTY_JOIN_GAP;
    uint32_t bx1=(uint32_t)b.x+b.width+HMI_DIRTY_JOIN_GAP;
    uint32_t by1=(uint32_t)b.y+b.height+HMI_DIRTY_JOIN_GAP;
    return (uint32_t)a.x<=bx1&&(uint32_t)b.x<=ax1&&(uint32_t)a.y<=by1&&(uint32_t)b.y<=ay1;
}

static HmiRect joined(HmiRect a,HmiRect b) {
    HmiRect r;uint16_t x0=min16(a.x,b.x),y0=min16(a.y,b.y);
    uint16_t x1=max16((uint16_t)(a.x+a.width),(uint16_t)(b.x+b.width));
    uint16_t y1=max16((uint16_t)(a.y+a.height),(uint16_t)(b.y+b.height));
    r.x=x0;r.y=y0;r.width=(uint16_t)(x1-x0);r.height=(uint16_t)(y1-y0);return r;
}

void hmi_init(void){dirty_count=0u;flushed_pixels=0u;}

void hmi_invalidate(HmiRect rect) {
    uint8_t i,j;rect=clamp_rect(rect);if(!rect.width||!rect.height)return;
    for(i=0;i<dirty_count;i++)if(touches(dirty[i],rect)){
        dirty[i]=joined(dirty[i],rect);
        for(j=0;j<dirty_count;j++)if(i!=j&&touches(dirty[i],dirty[j])){
            dirty[i]=joined(dirty[i],dirty[j]);dirty[j]=dirty[--dirty_count];j=0;
        }
        return;
    }
    if(dirty_count<HMI_DIRTY_CAPACITY){dirty[dirty_count++]=rect;return;}
    dirty_count=1u;dirty[0].x=0u;dirty[0].y=0u;dirty[0].width=320u;dirty[0].height=480u;
}

void hmi_invalidate_all(void){HmiRect r={0u,0u,320u,480u};dirty_count=0u;hmi_invalidate(r);}

void hmi_diff_and_invalidate(const HmiState *a,const HmiState *b){
    unsigned i;int selection_variant;if(!a||!b){hmi_invalidate_all();return;}
    selection_variant=a->page==HMI_PAGE_HOME&&b->page==HMI_PAGE_HOME&&
        a->power_state==HMI_POWER_READY&&b->power_state==HMI_POWER_READY&&
        a->drive_mode==b->drive_mode&&a->dialog==b->dialog&&a->selected_control!=b->selected_control;
    if((hmi_scene_for_state(a)!=hmi_scene_for_state(b)&&!selection_variant)||a->dynamic_values!=b->dynamic_values){hmi_invalidate_all();return;}
    if(strdiff(a->clock,b->clock))hmi_invalidate((HmiRect){256u,1u,58u,33u});
    if(a->mains_voltage!=b->mains_voltage||a->mains_frequency!=b->mains_frequency)
        hmi_invalidate((HmiRect){18u,49u,47u,28u});
    if(a->precharge_current!=b->precharge_current)hmi_invalidate((HmiRect){116u,49u,41u,16u});
    if(a->precharge_seconds!=b->precharge_seconds)hmi_invalidate((HmiRect){121u,90u,30u,21u});
    if(a->dc_bus_voltage!=b->dc_bus_voltage){hmi_invalidate((HmiRect){168u,49u,40u,16u});hmi_invalidate((HmiRect){62u,405u,50u,19u});}
    if(a->modulation_set!=b->modulation_set||a->modulation_actual!=b->modulation_actual)
        hmi_invalidate((HmiRect){119u,177u,191u,25u});
    if(a->rotation_set!=b->rotation_set||a->rotation_actual!=b->rotation_actual)
        hmi_invalidate((HmiRect){119u,204u,191u,25u});
    if(a->current_limit_set!=b->current_limit_set||a->current_limit_actual!=b->current_limit_actual)
        hmi_invalidate((HmiRect){119u,231u,191u,25u});
    if(a->selected_control!=b->selected_control){
        hmi_invalidate((HmiRect){10u,(uint16_t)(173u+27u*a->selected_control),300u,32u});
        hmi_invalidate((HmiRect){10u,(uint16_t)(173u+27u*b->selected_control),300u,32u});
    }
    if(a->output_voltage!=b->output_voltage)hmi_invalidate((HmiRect){14u,302u,140u,24u});
    if(a->output_current!=b->output_current)hmi_invalidate((HmiRect){14u,340u,140u,24u});
    if(a->output_power!=b->output_power)hmi_invalidate((HmiRect){14u,378u,140u,24u});
    if(a->rotor_frequency!=b->rotor_frequency)hmi_invalidate((HmiRect){168u,302u,139u,24u});
    if(a->stator_frequency!=b->stator_frequency)hmi_invalidate((HmiRect){168u,335u,139u,24u});
    if(a->slip!=b->slip)hmi_invalidate((HmiRect){168u,367u,139u,24u});
    if(a->motor_load!=b->motor_load)hmi_invalidate((HmiRect){168u,399u,139u,24u});
    if(a->temperature_rectifier!=b->temperature_rectifier||a->temperature_precharge!=b->temperature_precharge||
       a->temperature_dc!=b->temperature_dc||a->temperature_inverter!=b->temperature_inverter||
       a->temperature_motor!=b->temperature_motor)hmi_invalidate((HmiRect){62u,105u,246u,31u});
    if(strdiff(a->graph_title,b->graph_title))hmi_invalidate((HmiRect){8u,91u,304u,18u});
    for(i=0;i<HMI_GRAPH_CHANNELS;i++)if(a->graph[i].samples!=b->graph[i].samples||
       a->graph[i].sample_count!=b->graph[i].sample_count||a->graph[i].visible!=b->graph[i].visible||
       strdiff(a->graph[i].label,b->graph[i].label)||strdiff(a->graph[i].unit,b->graph[i].unit)){
        hmi_invalidate((HmiRect){7u,101u,306u,188u});hmi_invalidate((HmiRect){7u,337u,306u,91u});break;
    }
    if(a->journal!=b->journal||a->journal_count!=b->journal_count)hmi_invalidate((HmiRect){7u,92u,306u,337u});
}

void hmi_render_dirty(const HmiState *state,HmiFlushRectFn flush,void *user) {
    uint8_t i;HmiSceneId scene;if(!state||!flush)return;scene=hmi_scene_for_state(state);flushed_pixels=0u;
    for(i=0;i<dirty_count;i++){
        HmiRect r=dirty[i];uint16_t y=r.y,remaining=r.height;
        uint16_t rows=(uint16_t)(HMI_RENDER_BUFFER_PIXELS/r.width);if(rows<1u)rows=1u;if(rows>16u)rows=16u;
        while(remaining){uint16_t to_band=(uint16_t)(16u-(y&15u));uint16_t part=remaining<rows?remaining:rows;
            uint16_t band_y=(uint16_t)(y&0xfff0u);if(part>to_band)part=to_band;
            ui_begin_rect(r.x,y,r.width,part,0u);hmi_draw_generated_scene(scene,band_y,16u);hmi_draw_dynamic(state);
            flush(r.x,y,r.width,part,ui_strip_data(),r.width,user);
            flushed_pixels+=(uint32_t)r.width*part;y=(uint16_t)(y+part);remaining=(uint16_t)(remaining-part);
        }
    }
    dirty_count=0u;
}

void hmi_render_full(const HmiState *state,HmiFlushRectFn flush,void *user){hmi_invalidate_all();hmi_render_dirty(state,flush,user);}
uint32_t hmi_dirty_pixel_count(void){return flushed_pixels;}
uint32_t hmi_static_data_bytes(void){return hmi_generated_data_bytes+ui_font_data_bytes();}
uint32_t hmi_working_ram_bytes(void){return HMI_RENDER_BUFFER_BYTES+640u;}
