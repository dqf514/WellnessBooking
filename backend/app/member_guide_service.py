"""会员手机端操作指南 PDF：给会员的图文步骤说明（可直接发给会员）。"""
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.platypus import Flowable, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
FONT = "STSong-Light"
PINE = colors.HexColor("#173f35")
PINE_SOFT = colors.HexColor("#e8efe9")
GOLD = colors.HexColor("#b89b5e")
CREAM = colors.HexColor("#f7f5ef")
INK = colors.HexColor("#243b33")
MUTED = colors.HexColor("#66776f")
LINE = colors.HexColor("#d9e1da")
WHITE = colors.white

# 指南的七个步骤：标题、示意图（手机屏幕上的元素）、操作步骤与提示。
GUIDE_SECTIONS: list[dict] = [
    {
        "title": "一、把会员端添加到手机桌面",
        "screen": [("title", "音昱 Wellness"), ("text", "浏览器打开会员端网址"), ("button", "分享 / 菜单"), ("button", "添加到主屏幕"), ("note", "桌面出现「音昱 Wellness」图标")],
        "steps": [
            "用手机浏览器（iPhone 用 Safari，安卓用 Chrome）打开音昱 Wellness 会员端网址。",
            "iPhone：点屏幕底部中间的「分享」按钮，向下滑动，选择「添加到主屏幕」，再点右上角「添加」。",
            "安卓：在浏览器右上角点「⋮」菜单，选择「添加到主屏幕」或「桌面快捷方式」。",
            "回到手机桌面，就能看到「音昱 Wellness」图标；以后点这个图标就能直接进入，不用再找网址。",
        ],
        "tip": "小提示：把图标放到桌面第一屏，下次打开更方便。",
    },
    {
        "title": "二、会员登录",
        "screen": [("title", "登录"), ("text", "手机号 13900001001"), ("button", "发送验证码"), ("text", "6 位短信验证码"), ("button", "登录")],
        "steps": [
            "点屏幕右下角的「我的」（还没有登录时会自动弹出登录框）。",
            "输入 11 位手机号，点「发送验证码」，稍等几秒就能收到短信。",
            "把收到的 6 位验证码填进去，点「登录」。",
            "第一次登录的手机号会自动建立会员档案，之后用同一个手机号登录即可看到自己的预约和会员卡。",
        ],
        "tip": "验证码收不到时，请检查手机是否开通短信服务，或联系前台协助。",
    },
    {
        "title": "三、预约团课",
        "screen": [("title", "预约 · 课表"), ("tab", "日 / 周 / 月"), ("text", "09:00 流瑜伽  剩余 3"), ("button", "预约"), ("text", "14:00 普拉提  已约满")],
        "steps": [
            "点屏幕底部第二个「预约」，进入课表页。",
            "顶部可以在「日 / 周 / 月」之间切换查看方式，也可以点左右箭头翻看其他日期。",
            "找到想上的课，看右侧显示的剩余席位，点「预约」。",
            "在弹出的确认框里确认后即预约成功，名额会为您保留；预约成功后会收到短信通知。",
        ],
        "tip": "席位显示「已约满」表示这一节不能再约，可以换一节或到现场候补。",
    },
    {
        "title": "四、取消已预约的团课",
        "screen": [("title", "我的 · 我的预约"), ("text", "流瑜伽  12/03 09:00"), ("button", "取消"), ("text", "阴瑜伽  12/05 19:00  已签到")],
        "steps": [
            "点屏幕底部「我的」，进入页面后点上面的「我的预约」标签。",
            "在列表里找到要取消的课程，点右侧的「取消」。",
            "在确认框里再点一次「确认取消」即可。",
            "取消后名额立即释放，课程卡上的次数会自动返还给您；如果临近开课才取消，可能会记一次爽约。",
        ],
        "tip": "小提示：建议开课前至少 2 小时取消，避免影响会员信用。",
    },
    {
        "title": "五、查看课程介绍",
        "screen": [("title", "课程详情"), ("text", "流瑜伽 · 60 分钟"), ("text", "课程介绍：循序渐进…"), ("text", "老师：林老师 · 教室 A"), ("button", "预约")],
        "steps": [
            "在课表里点课程名称（不要点右侧的「预约」按钮），会弹出这节课的详情。",
            "详情里可以看到课程介绍、授课老师、教室、日期时间与课程时长。",
            "在详情下方还有老师的照片与简要介绍，可以先了解老师再决定要不要约。",
            "看完点右上角关闭，或直接点底部「预约」完成预约。",
        ],
        "tip": "想了解全部课程内容，可以点底部「卡课」页查看场馆开设的课程与会员卡。",
    },
    {
        "title": "六、查看老师资料",
        "screen": [("title", "引导者"), ("text", "林老师 · 瑜伽 / 普拉提"), ("text", "从业 10 年，专注…"), ("text", "周老师 · 私教 / 功能训练")],
        "steps": [
            "点屏幕底部第三个「引导者」，可以看到全部老师的照片、专长和介绍。",
            "每位老师下面都写有擅长的方向与教学风格，可以按需要挑选。",
            "在任意课程详情里，也能看到该节课老师的照片与简介。",
        ],
        "tip": "想指定老师上课时，可以到前台备注，或直接预约该老师的课程。",
    },
    {
        "title": "七、查看我的会员卡和预约的课程",
        "screen": [("title", "我的"), ("tab", "预约 / 会员卡 / 订单 / 签到"), ("text", "团课十次卡  剩余 6 次"), ("text", "2026-12-31 到期"), ("text", "12/03 09:00 流瑜伽")],
        "steps": [
            "点屏幕底部「我的」，进入后用顶部的标签切换。",
            "点「我的会员卡」：可以查看卡号、卡名、剩余次数、有效期，以及团课、私教、评估各项权益的余量。",
            "点「我的预约」：查看全部已预约的课程、时间与教室，需要时在这里取消。",
            "点「个人信息」：查看并修改自己的资料；点「到店签到」：到店后出示签到码，前台扫码即可签到并扣课。",
        ],
        "tip": "如对卡内次数有疑问，请到店找前台核对，签到记录可以在「我的预约」里查看。",
    },
]


def _style(size: float = 9, leading: float | None = None, color=INK, align: int = TA_LEFT) -> ParagraphStyle:
    return ParagraphStyle(name=f"guide-{size}-{leading}-{align}-{color}", fontName=FONT, fontSize=size, leading=leading or size * 1.5, textColor=color, alignment=align, wordWrap="CJK", splitLongWords=True)


class PhoneScreen(Flowable):
    """简化的手机界面示意图：用色块表示标题、标签、按钮与文字。"""

    def __init__(self, items: list[tuple[str, str]], width: float = 52 * mm, height: float = 74 * mm):
        super().__init__()
        self.items = items
        self.width = width
        self.height = height

    def draw(self):
        canvas = self.canv
        canvas.setFillColor(PINE)
        canvas.setStrokeColor(PINE)
        canvas.setLineWidth(1)
        canvas.roundRect(0, 0, self.width, self.height, 5 * mm, fill=1, stroke=0)
        canvas.setFillColor(WHITE)
        canvas.roundRect(2.4 * mm, 2.4 * mm, self.width - 4.8 * mm, self.height - 4.8 * mm, 3.4 * mm, fill=1, stroke=0)
        inner_left = 5 * mm
        inner_width = self.width - 10 * mm
        y = self.height - 12 * mm
        canvas.setFont(FONT, 7)
        for kind, text in self.items:
            if kind == "title":
                canvas.setFillColor(PINE_SOFT)
                canvas.roundRect(inner_left, y - 4.6 * mm, inner_width, 6.6 * mm, 1.6 * mm, fill=1, stroke=0)
                canvas.setFillColor(PINE)
                canvas.drawString(inner_left + 2 * mm, y - 2.8 * mm, text[:18])
                y -= 10 * mm
                continue
            if kind == "tab":
                canvas.setFillColor(PINE)
                canvas.roundRect(inner_left, y - 4.4 * mm, inner_width / 2 - 1 * mm, 6.4 * mm, 1.6 * mm, fill=1, stroke=0)
                canvas.setFillColor(PINE_SOFT)
                canvas.roundRect(inner_left + inner_width / 2, y - 4.4 * mm, inner_width / 2, 6.4 * mm, 1.6 * mm, fill=1, stroke=0)
                canvas.setFillColor(WHITE)
                canvas.drawString(inner_left + 3 * mm, y - 2.6 * mm, text[:12])
                canvas.setFillColor(PINE)
                canvas.drawString(inner_left + inner_width / 2 + 3 * mm, y - 2.6 * mm, "更多")
                y -= 10 * mm
                continue
            if kind == "button":
                canvas.setStrokeColor(LINE)
                canvas.setLineWidth(0.5)
                canvas.setFillColor(CREAM)
                canvas.roundRect(inner_left, y - 4.4 * mm, inner_width, 6.4 * mm, 1.6 * mm, fill=1, stroke=1)
                canvas.setFillColor(PINE)
                canvas.drawString(inner_left + 2.4 * mm, y - 2.6 * mm, text[:20])
                y -= 9 * mm
                continue
            if kind == "note":
                canvas.setFillColor(GOLD)
                canvas.roundRect(inner_left, y - 4.4 * mm, inner_width, 6.4 * mm, 1.6 * mm, fill=1, stroke=0)
                canvas.setFillColor(WHITE)
                canvas.drawString(inner_left + 2.4 * mm, y - 2.6 * mm, text[:20])
                y -= 9 * mm
                continue
            canvas.setFillColor(MUTED)
            canvas.setFont(FONT, 6.4)
            canvas.drawString(inner_left + 1 * mm, y - 2.2 * mm, text[:22])
            canvas.setFont(FONT, 7)
            y -= 7 * mm


def _header(canvas, doc) -> None:
    width, height = A4
    canvas.saveState()
    canvas.setFillColor(PINE)
    canvas.rect(0, height - 26 * mm, width, 26 * mm, fill=1, stroke=0)
    canvas.setFillColor(WHITE)
    canvas.setFont(FONT, 16)
    canvas.drawString(16 * mm, height - 15 * mm, "音昱 Wellness · 会员手机端操作指南")
    canvas.setFont(FONT, 8.5)
    canvas.drawString(16 * mm, height - 20 * mm, "预约团课 · 取消预约 · 查看课程与老师 · 查看会员卡")
    canvas.setFillColor(MUTED)
    canvas.setFont(FONT, 7)
    canvas.drawString(16 * mm, 12 * mm, "音昱 Wellness 会员端操作指南")
    canvas.drawRightString(width - 16 * mm, 12 * mm, f"第 {doc.page} 页")
    canvas.restoreState()


def _section_story(section: dict, index: int) -> list:
    steps = []
    for step_index, text in enumerate(section["steps"], start=1):
        steps.append(Paragraph(f"<b>{step_index}.</b> {text}", _style(9.5, 15)))
        steps.append(Spacer(1, 1.6 * mm))
    tip = Paragraph(f"<b>温馨提醒：</b> {section['tip'].replace('小提示：', '')}", _style(8.5, 13, PINE))
    tip_box = Table([[tip]], colWidths=[104 * mm], hAlign="LEFT")
    tip_box.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PINE_SOFT),
        ("BOX", (0, 0), (-1, -1), 0.4, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    heading = Paragraph(section["title"], _style(13, 17, PINE))
    body = Table([[PhoneScreen(section["screen"]), steps]], colWidths=[58 * mm, 104 * mm], hAlign="LEFT")
    body.setStyle(TableStyle([
        ("VALIGN", (0, 0), (0, 0), "TOP"),
        ("VALIGN", (1, 0), (1, 0), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return [heading, Spacer(1, 2.5 * mm), body, Spacer(1, 3 * mm), tip_box, Spacer(1, 7 * mm)]


def member_guide_pdf() -> bytes:
    """生成会员手机端操作指南 PDF（中文，7 个步骤）。"""
    output = BytesIO()
    doc = SimpleDocTemplate(output, pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=34 * mm, bottomMargin=18 * mm, title="会员手机端操作指南", author="音昱 Wellness")
    story: list = []
    intro = Paragraph("第一次使用会员端？这份指南带您一步步完成：把会员端添加到手机桌面、登录、预约团课、取消预约、查看课程与老师资料，以及查看自己的会员卡和已预约课程。按照顺序看一遍，就能轻松自助预约。", _style(10, 16))
    story.append(intro)
    story.append(Spacer(1, 5 * mm))
    for index, section in enumerate(GUIDE_SECTIONS):
        story.extend(_section_story(section, index))
    story.append(Paragraph("如有任何疑问，欢迎随时联系前台，我们很乐意帮您完成第一次预约。", _style(9.5, 15, PINE)))
    doc.build(story, onFirstPage=_header, onLaterPages=_header)
    return output.getvalue()
