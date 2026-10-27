"""Draw the calculator icon from shapes, without using screenshot pixels."""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parent
S = 2048


def gradient_mask(mask, top, bottom):
    strip = Image.new('RGB', (1, S))
    for y in range(S):
        t = y / (S - 1)
        strip.putpixel((0, y), tuple(round(top[i] * (1 - t) + bottom[i] * t) for i in range(3)))
    layer = strip.resize((S, S)).convert('RGBA')
    layer.putalpha(mask)
    return layer


def rounded_mask(box, radius):
    mask = Image.new('L', (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle(box, radius=radius, fill=255)
    return mask


def add_shadow(base, mask, offset, blur, opacity):
    shadow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    shadow.putalpha(mask.filter(ImageFilter.GaussianBlur(blur)).point(lambda value: value * opacity // 255))
    shifted = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    shifted.paste(shadow, offset)
    base.alpha_composite(shifted)


canvas = Image.new('RGBA', (S, S), '#c7cbcd')
plate = rounded_mask((68, 68, 1980, 1980), 430)
add_shadow(canvas, plate, (0, 22), 65, 120)
canvas.alpha_composite(gradient_mask(plate, (247, 248, 248), (190, 195, 197)))

for center_y in (635, 1415):
    box = (245, center_y - 340, 925, center_y + 340)
    mask = rounded_mask(box, 340)
    add_shadow(canvas, mask, (0, 28), 42, 120)
    canvas.alpha_composite(gradient_mask(mask, (73, 74, 75), (10, 11, 12)))
    shine = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(shine).arc((box[0] + 34, box[1] + 28, box[2] - 34, box[3] - 38), 190, 344, fill=(255, 255, 255, 48), width=24)
    canvas.alpha_composite(shine)

green_box = (1045, 255, 1795, 1765)
green = rounded_mask(green_box, 375)
add_shadow(canvas, green, (0, 30), 48, 140)
canvas.alpha_composite(gradient_mask(green, (79, 224, 27), (0, 175, 14)))
shine = Image.new('RGBA', (S, S), (0, 0, 0, 0))
ImageDraw.Draw(shine).arc((1080, 285, 1760, 1700), 188, 350, fill=(255, 255, 255, 48), width=25)
canvas.alpha_composite(shine)

draw = ImageDraw.Draw(canvas)
white = (255, 255, 255, 255)
draw.rounded_rectangle((543, 446, 627, 824), radius=42, fill=white)
draw.rounded_rectangle((395, 593, 775, 677), radius=42, fill=white)
draw.rounded_rectangle((390, 1373, 780, 1457), radius=42, fill=white)
draw.rounded_rectangle((1225, 822, 1620, 910), radius=44, fill=white)
draw.rounded_rectangle((1225, 1030, 1620, 1118), radius=44, fill=white)

rgb = canvas.convert('RGB').resize((1024, 1024), Image.Resampling.LANCZOS)
rgb.save(ROOT / 'iOS/XiaoMingCalc/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png', optimize=True)
for target in (180, 512):
    rgb.resize((target, target), Image.Resampling.LANCZOS).save(ROOT / f'Web/icons/icon-{target}.png', optimize=True)
print('已绘制 1024×1024 原创计算器图标')
