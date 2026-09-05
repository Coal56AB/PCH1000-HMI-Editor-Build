#include <stdint.h>
#include <stddef.h>

#define UI_WIDTH 320
#define UI_HEIGHT 480
#include "hmi_gfx.h"

#if defined(__GNUC__) || defined(__clang__)
#define UI_EXPORT __attribute__((visibility("default")))
#else
#define UI_EXPORT
#endif

/* Единственный пиксельный буфер рендерера: 320 x 16 x RGB565 = 10240 байт. */
static uint16_t ui_strip[HMI_RENDER_BUFFER_PIXELS];
static uint8_t ui_text_input[384];
static int16_t strip_x0,strip_y0;
static int16_t strip_w,strip_h;
static int16_t clip_x0,clip_y0,clip_x1,clip_y1;

#include "font_data.inc"

uint32_t ui_font_data_bytes(void){
    return (uint32_t)(sizeof(UI_FONTS)+sizeof(UI_GLYPHS)+sizeof(UI_FONT_BITS));
}

static uint16_t mix565(uint16_t a, uint16_t b, int n, int d) {
    uint32_t ar=(a>>11)&31, ag=(a>>5)&63, ab=a&31;
    uint32_t br=(b>>11)&31, bg=(b>>5)&63, bb=b&31;
    return (uint16_t)((((ar*(d-n)+br*n)/d)<<11)|(((ag*(d-n)+bg*n)/d)<<5)|((ab*(d-n)+bb*n)/d));
}

static uint16_t over565(uint16_t background, uint16_t foreground, int alpha) {
    if (alpha <= 0) return background;
    if (alpha >= 15) return foreground;
    return mix565(background, foreground, alpha, 15);
}

static void px(int x, int y, uint16_t c) {
    if (x < strip_x0 || x >= strip_x0 + strip_w || y < strip_y0 || y >= strip_y0 + strip_h || x<clip_x0 || x>=clip_x1 || y<clip_y0 || y>=clip_y1) return;
    ui_strip[(y-strip_y0)*strip_w+(x-strip_x0)]=c;
}

static void px_alpha(int x, int y, uint16_t c, int alpha) {
    if (x < strip_x0 || x >= strip_x0 + strip_w || y < strip_y0 || y >= strip_y0 + strip_h || x<clip_x0 || x>=clip_x1 || y<clip_y0 || y>=clip_y1 || alpha<=0) return;
    uint16_t *dst=&ui_strip[(y-strip_y0)*strip_w+(x-strip_x0)];
    *dst=over565(*dst,c,(alpha+8)>>4);
}

UI_EXPORT uint32_t ui_strip_ptr(void) { return (uint32_t)(uintptr_t)ui_strip; }
const uint16_t *ui_strip_data(void) { return ui_strip; }
UI_EXPORT uint32_t ui_text_ptr(void) { return (uint32_t)(uintptr_t)ui_text_input; }
UI_EXPORT int ui_strip_bytes(void) { return (int)HMI_RENDER_BUFFER_BYTES; }
UI_EXPORT int ui_strip_height(void) { return strip_h; }
UI_EXPORT int ui_buffer_width(void) { return strip_w; }
UI_EXPORT int ui_buffer_height(void) { return strip_h; }

UI_EXPORT void ui_begin(int y0, int rows, uint16_t color) {
    ui_begin_rect(0,y0,UI_WIDTH,rows,color);
}

UI_EXPORT void ui_begin_rect(int x,int y,int width,int height,uint16_t color) {
    uint32_t pixels;
    if(x<0){width+=x;x=0;}if(y<0){height+=y;y=0;}
    if(x+width>UI_WIDTH)width=UI_WIDTH-x;
    if(y+height>UI_HEIGHT)height=UI_HEIGHT-y;
    if(width<1)width=1;
    if(height<1)height=1;
    pixels=(uint32_t)width*(uint32_t)height;
    if(pixels>HMI_RENDER_BUFFER_PIXELS)height=(int)(HMI_RENDER_BUFFER_PIXELS/(uint32_t)width);
    strip_x0=(int16_t)x;strip_y0=(int16_t)y;strip_w=(int16_t)width;strip_h=(int16_t)height;
    clip_x0=0;clip_y0=0;clip_x1=UI_WIDTH;clip_y1=UI_HEIGHT;
    {int n=strip_w*strip_h;int i;for(i=0;i<n;i++)ui_strip[i]=color;}
}

UI_EXPORT void ui_set_clip(int x,int y,int w,int h){clip_x0=(int16_t)(x<0?0:x);clip_y0=(int16_t)(y<0?0:y);clip_x1=(int16_t)(x+w>UI_WIDTH?UI_WIDTH:x+w);clip_y1=(int16_t)(y+h>UI_HEIGHT?UI_HEIGHT:y+h);}

UI_EXPORT void ui_fill_rect(int x, int y, int w, int h, uint16_t c) {
    if(w<=0||h<=0)return;
    int x0=x<clip_x0?clip_x0:x,x1=x+w>clip_x1?clip_x1:x+w,y0=y<strip_y0?strip_y0:y,y1=y+h>strip_y0+strip_h?strip_y0+strip_h:y+h;
    if(y0<clip_y0)y0=clip_y0;
    if(y1>clip_y1)y1=clip_y1;
    if(x0<strip_x0)x0=strip_x0;
    if(x1>strip_x0+strip_w)x1=strip_x0+strip_w;
    for(int yy=y0;yy<y1;yy++){uint16_t *p=&ui_strip[(yy-strip_y0)*strip_w+(x0-strip_x0)];for(int xx=x0;xx<x1;xx++)*p++=c;}
}

UI_EXPORT void ui_fill_gradient_v(int x,int y,int w,int h,uint16_t top,uint16_t bottom){
    if(w<=0||h<=0)return;
    int y0=y<strip_y0?strip_y0:y,y1=y+h>strip_y0+strip_h?strip_y0+strip_h:y+h;
    for(int yy=y0;yy<y1;yy++)ui_fill_rect(x,yy,w,1,mix565(top,bottom,yy-y,h>1?h-1:1));
}

UI_EXPORT void ui_line(int x0,int y0,int x1,int y1,uint16_t c){
    int dx=x1>x0?x1-x0:x0-x1,sx=x0<x1?1:-1,dy=y1>y0?y0-y1:y1-y0,sy=y0<y1?1:-1,err=dx+dy;
    for(;;){px(x0,y0,c);if(x0==x1&&y0==y1)break;int e2=err<<1;if(e2>=dy){err+=dy;x0+=sx;}if(e2<=dx){err+=dx;y0+=sy;}}
}

UI_EXPORT void ui_line_aa(int x0,int y0,int x1,int y1,uint16_t c){
    int dx=x1-x0,dy=y1-y0,adx=dx<0?-dx:dx,ady=dy<0?-dy:dy;
    if(dx==0||dy==0){ui_line(x0,y0,x1,y1,c);return;}
    if(adx>=ady){
        if(x0>x1){int t=x0;x0=x1;x1=t;t=y0;y0=y1;y1=t;dx=x1-x0;dy=y1-y0;}
        int yfp=y0*256,step=(dy*256)/dx;
        for(int x=x0;x<=x1;x++,yfp+=step){int y=yfp>>8,frac=yfp&255;px_alpha(x,y,c,255-frac);px_alpha(x,y+1,c,frac);}
    }else{
        if(y0>y1){int t=x0;x0=x1;x1=t;t=y0;y0=y1;y1=t;dx=x1-x0;dy=y1-y0;}
        int xfp=x0*256,step=(dx*256)/dy;
        for(int y=y0;y<=y1;y++,xfp+=step){int x=xfp>>8,frac=xfp&255;px_alpha(x,y,c,255-frac);px_alpha(x+1,y,c,frac);}
    }
}

UI_EXPORT void ui_line_width(int x0,int y0,int x1,int y1,int width,uint16_t c){
    if(width<=1){ui_line(x0,y0,x1,y1,c);return;}
    if(width>6)width=6;
    int dx=x1>x0?x1-x0:x0-x1,dy=y1>y0?y1-y0:y0-y1;
    int first=-(width/2),last=first+width-1;
    for(int o=first;o<=last;o++){
        if(dx>=dy)ui_line(x0,y0+o,x1,y1+o,c);
        else ui_line(x0+o,y0,x1+o,y1,c);
    }
}

UI_EXPORT void ui_rect(int x,int y,int w,int h,uint16_t c){if(w<=0||h<=0)return;ui_line(x,y,x+w-1,y,c);ui_line(x,y+h-1,x+w-1,y+h-1,c);ui_line(x,y,x,y+h-1,c);ui_line(x+w-1,y,x+w-1,y+h-1,c);}

static int inside_round(int xx,int yy,int w,int h,int r){
    if(r<=0)return 1;
    int cx=xx<r?r-1:(xx>=w-r?w-r:xx),cy=yy<r?r-1:(yy>=h-r?h-r:yy),dx=xx-cx,dy=yy-cy;return dx*dx+dy*dy<=r*r;
}

UI_EXPORT void ui_fill_round_rect(int x,int y,int w,int h,int r,uint16_t c){
    if(w<=0||h<=0)return;
    if(r<0)r=0;
    if(r>w/2)r=w/2;
    if(r>h/2)r=h/2;
    int y0=y<strip_y0?strip_y0:y,y1=y+h>strip_y0+strip_h?strip_y0+strip_h:y+h;
    for(int yy=y0;yy<y1;yy++)for(int xx=0;xx<w;xx++)if(inside_round(xx,yy-y,w,h,r))px(x+xx,yy,c);
}

UI_EXPORT void ui_round_rect(int x,int y,int w,int h,int r,uint16_t c){
    if(w<=1||h<=1)return;
    int y0=strip_y0-y;if(y0<0)y0=0;if(y0<clip_y0-y)y0=clip_y0-y;
    int y1=strip_y0+strip_h-y;if(y1>h)y1=h;if(y1>clip_y1-y)y1=clip_y1-y;
    for(int yy=y0;yy<y1;yy++)for(int xx=0;xx<w;xx++){
        int outer=inside_round(xx,yy,w,h,r);
        int inner=xx>0&&yy>0&&xx<w-1&&yy<h-1&&inside_round(xx-1,yy-1,w-2,h-2,r>0?r-1:0);
        if(outer&&!inner)px(x+xx,y+yy,c);
    }
}

UI_EXPORT void ui_circle(int cx,int cy,int r,uint16_t c,int filled){
    if(r<=0)return;
    int rr=r*r,ri=(r-1)*(r-1);for(int y=-r;y<=r;y++)for(int x=-r;x<=r;x++){int d=x*x+y*y;if(!filled&&d==rr&&(x==0||y==0))continue;if(d<=rr&&(filled||d>=ri))px(cx+x,cy+y,c);}
}

UI_EXPORT void ui_circle_width(int cx,int cy,int r,int width,uint16_t c){
    if(width<=1){ui_circle(cx,cy,r,c,0);return;}
    if(width>6)width=6;
    for(int i=0;i<width&&r-i>0;i++)ui_circle(cx,cy,r-i,c,0);
}

static int edge2(int ax,int ay,int bx,int by,int pxv,int pyv){return(pxv-ax)*(by-ay)-(pyv-ay)*(bx-ax);}

UI_EXPORT void ui_fill_triangle(int x0,int y0,int x1,int y1,int x2,int y2,uint16_t c){
    int minx=x0<x1?(x0<x2?x0:x2):(x1<x2?x1:x2),maxx=x0>x1?(x0>x2?x0:x2):(x1>x2?x1:x2);
    int miny=y0<y1?(y0<y2?y0:y2):(y1<y2?y1:y2),maxy=y0>y1?(y0>y2?y0:y2):(y1>y2?y1:y2);
    int area=edge2(x0,y0,x1,y1,x2,y2);if(area==0)return;
    if(minx<clip_x0)minx=clip_x0;
    if(maxx>=clip_x1)maxx=clip_x1-1;
    if(miny<clip_y0)miny=clip_y0;
    if(maxy>=clip_y1)maxy=clip_y1-1;
    if(miny<strip_y0)miny=strip_y0;
    if(maxy>=strip_y0+strip_h)maxy=strip_y0+strip_h-1;
    for(int y=miny;y<=maxy;y++)for(int x=minx;x<=maxx;x++){
        int a=edge2(x0,y0,x1,y1,x,y),b=edge2(x1,y1,x2,y2,x,y),d=edge2(x2,y2,x0,y0,x,y);
        if((area>0&&a>=0&&b>=0&&d>=0)||(area<0&&a<=0&&b<=0&&d<=0))px(x,y,c);
    }
}

static uint32_t utf8_next(const uint8_t *s,int len,int *i){
    uint32_t c=s[(*i)++];if(c<128)return c;
    if((c&0xe0)==0xc0&&*i<len){uint32_t b1=s[(*i)++];return((c&31)<<6)|(b1&63);}
    if((c&0xf0)==0xe0&&*i+1<len){uint32_t b1=s[(*i)++],b2=s[(*i)++];return((c&15)<<12)|((b1&63)<<6)|(b2&63);}
    return'?';
}
static const ui_font_t *font_for(int pxv,int bold){const ui_font_t *best=&UI_FONTS[0];int bd=1000;for(int i=0;i<UI_FONT_COUNT;i++){if((int)UI_FONTS[i].bold!=(bold?1:0))continue;int d=(int)UI_FONTS[i].px-pxv;if(d<0)d=-d;if(d<bd){bd=d;best=&UI_FONTS[i];}}return best;}
static const ui_glyph_t *glyph_for(const ui_font_t *f,uint32_t cp){for(int i=0;i<f->count;i++){const ui_glyph_t *g=&UI_GLYPHS[f->first+i];if(g->cp==cp)return g;}for(int i=0;i<f->count;i++){const ui_glyph_t *g=&UI_GLYPHS[f->first+i];if(g->cp=='?')return g;}return 0;}

UI_EXPORT int ui_measure_text(int pxv,int len){const ui_font_t *f=font_for(pxv,0);int i=0,w=0;if(len>384)len=384;while(i<len){const ui_glyph_t *g=glyph_for(f,utf8_next(ui_text_input,len,&i));if(g)w+=g->advance;}return w;}

UI_EXPORT void ui_text_weight(int x,int baseline,int pxv,uint16_t c,int len,int bold){
    const ui_font_t *f=font_for(pxv,bold);int i=0,cursor=x;if(len>384)len=384;
    while(i<len){
        const ui_glyph_t *g=glyph_for(f,utf8_next(ui_text_input,len,&i));if(!g)continue;
        int total=g->w*g->h;
        for(int pixel=0;pixel<total;pixel++){
            int alpha=(UI_FONT_BITS[g->off+(pixel>>1)]>>((pixel&1)*4))&15;
            if(alpha){
                int gx=cursor+g->xoff+(pixel%g->w),gy=baseline+g->yoff+(pixel/g->w);
                if(gx>=strip_x0&&gx<strip_x0+strip_w&&gy>=strip_y0&&gy<strip_y0+strip_h&&gx>=clip_x0&&gx<clip_x1&&gy>=clip_y0&&gy<clip_y1){
                    uint16_t *dst=&ui_strip[(gy-strip_y0)*strip_w+(gx-strip_x0)];
                    *dst=over565(*dst,c,alpha);
                }
            }
        }
        cursor+=g->advance;
    }
}

UI_EXPORT void ui_text_weight_fit(int x,int baseline,int pxv,uint16_t c,int len,int bold,int target_width){
    const ui_font_t *f=font_for(pxv,bold);int i=0,total=0,count=0;
    if(len>384)len=384;
    while(i<len){const ui_glyph_t *g=glyph_for(f,utf8_next(ui_text_input,len,&i));if(g){total+=g->advance;count++;}}
    /* Never stretch glyph bitmaps to match a DOM line.  Stretching made the
     * same letter acquire a different raster depending on its fractional
     * position inside a word (especially visible on Cyrillic А at 7-9 px).
     * Keep every glyph pixel-identical and distribute the small width
     * correction through advances only. */
    int natural_cursor=0;i=0;
    while(i<len){
        const ui_glyph_t *g=glyph_for(f,utf8_next(ui_text_input,len,&i));if(!g)continue;
        int cursor=x+natural_cursor;
        if(count>1&&total>0&&target_width>0)cursor=x+(natural_cursor*target_width+total/2)/total;
        int total_px=g->w*g->h;
        for(int pixel=0;pixel<total_px;pixel++){
            int alpha=(UI_FONT_BITS[g->off+(pixel>>1)]>>((pixel&1)*4))&15;
            if(alpha){
                int gx=cursor+g->xoff+(pixel%g->w),gy=baseline+g->yoff+(pixel/g->w);
                if(gx>=strip_x0&&gx<strip_x0+strip_w&&gy>=strip_y0&&gy<strip_y0+strip_h&&gx>=clip_x0&&gx<clip_x1&&gy>=clip_y0&&gy<clip_y1){
                    uint16_t *dst=&ui_strip[(gy-strip_y0)*strip_w+(gx-strip_x0)];*dst=over565(*dst,c,alpha);
                }
            }
        }
        natural_cursor+=g->advance;
    }
}

UI_EXPORT void ui_text(int x,int baseline,int pxv,uint16_t c,int len){ui_text_weight(x,baseline,pxv,c,len,0);}

static int cstr_copy(const char *s){
    int n=0;
    if(!s)return 0;
    while(s[n] && n<(int)sizeof(ui_text_input)){ui_text_input[n]=(uint8_t)s[n];n++;}
    return n;
}

int ui_measure_cstr(int pxv,const char *utf8){return ui_measure_text(pxv,cstr_copy(utf8));}
void ui_text_cstr(int x,int baseline,int pxv,uint16_t c,const char *utf8,int bold){
    int n=cstr_copy(utf8);ui_text_weight(x,baseline,pxv,c,n,bold);
}
void ui_text_fit_cstr(int x,int baseline,int pxv,uint16_t c,const char *utf8,int bold,int target_width){
    int n=cstr_copy(utf8);ui_text_weight_fit(x,baseline,pxv,c,n,bold,target_width);
}

/* STM32 backend uses the same ui_begin/ui_* calls, then sends ui_strip to the
 * ST7796 window (0,y0)-(319,y0+rows-1) through FSMC/DMA. No full framebuffer. */
