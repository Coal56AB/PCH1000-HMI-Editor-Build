#include "hmi_state.h"
#include "hmi_gfx.h"

#include <stdio.h>
#include <string.h>

static void center_pair(int center,int baseline,int px,uint16_t color,
                        const char *value,const char *unit,int gap){
    int a=ui_measure_cstr(px,value),b=ui_measure_cstr(px,unit),x=center-(a+(unit[0]?gap+b:0))/2;
    ui_text_cstr(x,baseline,px,color,value,1);
    if(unit[0])ui_text_cstr(x+a+gap,baseline,px,color,unit,1);
}

static void clear_box(int x,int y,int w,int h){ui_fill_rect(x,y,w,h,4324u);}

static void draw_graph(const HmiState *s){
    unsigned ch,i;const int x0=30,y0=106,w=254,h=177;
    ui_set_clip(1,1,318,478);ui_fill_rect(x0,y0,w+1,h+1,4357u);
    for(i=0;i<=4u;i++)ui_line(x0,y0+(int)(h*i/4u),x0+w,y0+(int)(h*i/4u),12841u);
    for(i=0;i<=5u;i++)ui_line(x0+(int)(w*i/5u),y0,x0+(int)(w*i/5u),y0+h,12841u);
    for(ch=0;ch<HMI_GRAPH_CHANNELS;ch++){
        const HmiGraphChannel *g=&s->graph[ch];int px=0,py=0,started=0;
        if(g->label){int tw=ui_measure_cstr(10,g->label),cx=42+(int)ch*77;
            ui_fill_rect(10+(int)ch*77,342,64,18,4324u);
            ui_text_cstr(cx-tw/2,356,10,g->visible?g->color_rgb565:48664u,g->label,1);
        }
        if(!g->visible||!g->samples||g->sample_count<2u||g->maximum<=g->minimum)continue;
        for(i=0;i<g->sample_count;i++){
            int x=x0+(int)((uint32_t)i*w/(g->sample_count-1u));
            int32_t v=g->samples[i];int y=y0+(int)((int32_t)(g->maximum-v)*h/(g->maximum-g->minimum));
            if(y<y0)y=y0;
            if(y>y0+h)y=y0+h;
            if(started)ui_line(px,py,x,y,g->color_rgb565);
            px=x;py=y;started=1;
        }
    }
}

static void draw_journal(const HmiState *s){
    uint16_t row,count=s->journal_count>7u?7u:s->journal_count;
    ui_set_clip(9,133,302,280);ui_fill_rect(9,133,302,280,4357u);
    for(row=0;row<7u;row++)ui_line(9,167+(int)row*35,310,167+(int)row*35,12809u);
    for(row=0;row<count;row++){
        const HmiJournalItem *item=&s->journal[row];char date[11]={0};const char *time="";
        uint16_t color=15709u;const char *type="Инфо.",*icon="i";int y=149+(int)row*35;
        if(item->timestamp){size_t n=strlen(item->timestamp);if(n>10u)n=10u;memcpy(date,item->timestamp,n);if(strlen(item->timestamp)>11u)time=item->timestamp+11;}
        if(item->type&&strcmp(item->type,"warn")==0){color=62754u;type="Предупр.";icon="!";}
        else if(item->type&&strcmp(item->type,"fault")==0){color=62154u;type="Авария";icon="×";}
        ui_text_cstr(14,y,12,61342u,date,0);ui_text_cstr(14,y+13,12,44503u,time,0);
        ui_text_cstr(81,y+7,12,color,icon,1);ui_text_cstr(91,y+6,12,color,type,0);
        if(item->message)ui_text_cstr(154,y+6,12,61342u,item->message,0);
    }
    ui_set_clip(1,1,318,478);
}

/* Dynamic overlays intentionally reuse the exact exported font rasterizer.
 * Static layout coordinates remain generated from the HTML. */
void hmi_draw_dynamic(const HmiState *s) {
    char value[24];int width,x;uint16_t actual_color;
    if(!s)return;
    if(s->clock&&strcmp(s->clock,"14:32")!=0){
        ui_set_clip(1,1,318,478);ui_fill_round_rect(258,3,54,29,4,2211u);
        ui_round_rect(258,3,54,29,4,12842u);
        ui_text_fit_cstr(270,23,12,57116u,s->clock,1,31);
    }
    if(s->power_state==HMI_POWER_CHARGE&&s->precharge_seconds>=0.0f&&
       (s->precharge_seconds<0.65f||s->precharge_seconds>=0.75f)){
        (void)snprintf(value,sizeof(value),"%.1f",(double)s->precharge_seconds);
        ui_set_clip(1,1,318,478);ui_fill_round_rect(123,92,26,17,2,2211u);
        ui_round_rect(123,92,26,17,2,62946u);
        width=ui_measure_cstr(10,value);x=136-(width+7)/2;
        ui_text_cstr(x,104,10,62946u,value,1);ui_text_cstr(x+width+3,104,10,62946u,"с",1);
    }
    if(!s->dynamic_values)return;
    if(s->page==HMI_PAGE_GRAPHS){draw_graph(s);return;}
    if(s->page==HMI_PAGE_JOURNAL&&s->journal){draw_journal(s);return;}
    if(s->page!=HMI_PAGE_HOME)return;
    ui_set_clip(1,1,318,478);
    ui_fill_rect(20,51,43,24,4357u);
    (void)snprintf(value,sizeof(value),"%.0f",(double)s->mains_voltage);center_pair(40,64,10,34276u,value,"В",2);
    (void)snprintf(value,sizeof(value),"%.1f",(double)s->mains_frequency);center_pair(40,73,10,34276u,value,"Гц",3);
    ui_fill_rect(118,51,37,12,4357u);
    (void)snprintf(value,sizeof(value),"%.2f",(double)s->precharge_current);center_pair(136,61,10,34276u,value,"А",3);
    ui_fill_rect(170,51,36,12,4357u);
    (void)snprintf(value,sizeof(value),"%.0f",(double)s->dc_bus_voltage);center_pair(188,61,10,34276u,value,"В",3);
    ui_fill_rect(66,119,39,15,4357u);(void)snprintf(value,sizeof(value),"%.0f",(double)s->temperature_rectifier);center_pair(85,132,10,34276u,value,"°C",2);
    ui_fill_rect(117,119,39,15,4357u);(void)snprintf(value,sizeof(value),"%.0f",(double)s->temperature_precharge);center_pair(136,132,10,34276u,value,"°C",2);
    ui_fill_rect(169,119,39,15,4357u);(void)snprintf(value,sizeof(value),"%.0f",(double)s->temperature_dc);center_pair(188,132,10,34276u,value,"°C",2);
    ui_fill_rect(217,119,39,15,4357u);(void)snprintf(value,sizeof(value),"%.0f",(double)s->temperature_inverter);center_pair(236,132,10,34276u,value,"°C",2);
    ui_fill_rect(268,107,39,15,4357u);(void)snprintf(value,sizeof(value),"%.0f",(double)s->temperature_motor);center_pair(287,120,10,34276u,value,"°C",2);

    clear_box(121,179,97,21);clear_box(226,179,82,21);
    actual_color=s->regulation_active?63016u:36454u;
    (void)snprintf(value,sizeof(value),"%.0f",(double)s->modulation_set);center_pair(179,195,13,36454u,value,"%",4);
    (void)snprintf(value,sizeof(value),"%.0f",(double)s->modulation_actual);center_pair(265,195,12,actual_color,value,"%",3);
    clear_box(121,206,97,21);clear_box(226,206,82,21);
    (void)snprintf(value,sizeof(value),"%.0f",(double)(s->rotation_set*60.0f));center_pair(179,223,13,36454u,value,"об/мин",4);
    (void)snprintf(value,sizeof(value),"%.0f",(double)(s->rotation_actual*60.0f));center_pair(265,222,12,actual_color,value,"об/мин",3);
    clear_box(121,233,97,21);clear_box(226,233,82,21);
    (void)snprintf(value,sizeof(value),"%.0f",(double)s->current_limit_set);center_pair(179,250,13,36454u,value,"%",4);
    (void)snprintf(value,sizeof(value),"%.0f",(double)s->current_limit_actual);center_pair(265,250,12,actual_color,value,"%",3);

    clear_box(15,304,137,20);(void)snprintf(value,sizeof(value),"%.0f",(double)s->output_voltage);ui_text_cstr(16,322,16,36454u,value,1);
    clear_box(15,342,137,20);(void)snprintf(value,sizeof(value),"%.2f",(double)s->output_current);ui_text_cstr(16,360,16,36454u,value,1);
    clear_box(15,380,137,20);(void)snprintf(value,sizeof(value),"%.2f",(double)s->output_power);ui_text_cstr(16,398,16,36454u,value,1);
    clear_box(64,407,45,15);(void)snprintf(value,sizeof(value),"%.0f",(double)s->dc_bus_voltage);ui_text_cstr(66,420,9,36454u,value,1);
    clear_box(170,304,135,20);(void)snprintf(value,sizeof(value),"%.1f",(double)s->rotor_frequency);ui_text_cstr(171,322,16,15709u,value,1);
    clear_box(170,337,135,20);(void)snprintf(value,sizeof(value),"%.1f",(double)s->stator_frequency);ui_text_cstr(171,355,16,15709u,value,1);
    clear_box(170,369,135,20);(void)snprintf(value,sizeof(value),"%.1f",(double)s->slip);ui_text_cstr(171,387,16,15709u,value,1);
    clear_box(170,401,135,20);
    if(s->motor_load<0.0f)ui_text_cstr(171,419,16,15709u,"—",1);
    else{(void)snprintf(value,sizeof(value),"%.0f",(double)s->motor_load);ui_text_cstr(171,419,16,15709u,value,1);}
}
