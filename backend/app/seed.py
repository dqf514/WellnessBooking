import json
from datetime import datetime

from .booking_service import create_booking, transition_booking
from .card_service import issue_card
from .config import SEED_DEMO_DATA
from .database import SessionLocal
from .models import AppSettings, BackupPlanSettings, Booking, CardProduct, ClassSession, Course, Member, Room, SmsSettings, Teacher, User
from .security import hash_password
from .sms_service import DEFAULT_BOOKING, DEFAULT_CANCEL, DEFAULT_REMINDER
from .utils import add_days, today


def run_seed() -> None:
    db = SessionLocal()
    try:
        if not db.get(AppSettings, 1):
            db.add(AppSettings(id=1))
        if not db.get(SmsSettings, 1):
            db.add(SmsSettings(id=1, template_booking=DEFAULT_BOOKING, template_cancel=DEFAULT_CANCEL, template_reminder=DEFAULT_REMINDER))
        if not db.get(BackupPlanSettings, 1):
            db.add(BackupPlanSettings(id=1))
        if db.query(User).count() == 0:
            db.add_all([
                User(username="admin", password_hash=hash_password("admin123"), full_name="系统管理员", phone="13800000001", role="admin"),
                User(username="frontdesk", password_hash=hash_password("frontdesk123"), full_name="前台小屿", phone="13800000002", role="frontdesk"),
                User(username="finance", password_hash=hash_password("finance123"), full_name="财务清禾", phone="13800000003", role="finance"),
                User(username="teacher", password_hash=hash_password("teacher123"), full_name="程天澜", phone="13800000004", role="teacher"),
                User(username="viewer", password_hash=hash_password("viewer123"), full_name="访客查看", role="viewer"),
            ])
        db.commit()
        if not SEED_DEMO_DATA:
            return
        if db.query(Room).count() == 0:
            db.add_all([
                Room(name="修葺室 1", name_en="Practice Room", capacity=12, color="#49796a"),
                Room(name="练功房", name_en="Movement Room", capacity=16, color="#6c8b74"),
                Room(name="静修斋", name_en="Quiet Room", capacity=8, color="#7a7191"),
                Room(name="创艺轩", name_en="Inspiration Room", capacity=20, color="#a77350"),
                Room(name="私教室", name_en="Private Studio", capacity=2, color="#41677a"),
            ])
        if db.query(Teacher).count() == 0:
            teacher_user = db.query(User).filter(User.username == "teacher").first()
            db.add_all([
                Teacher(user_id=teacher_user.id, name="程天澜", name_en="Cheng Tianlan", phone="13800000004", gender="女", specialties="八段锦 · 中医养生", specialties_en="Baduanjin · Traditional wellness", bio="十五年身心练习与教学经验，关注呼吸、体态与日常节律。", bio_en="15 years of movement and wellness teaching, focused on breath, alignment and daily rhythm.", image_url="https://images.unsplash.com/photo-1599447421416-3414500d18a5?auto=format&fit=crop&w=640&q=80"),
                Teacher(name="范纯洋", name_en="Freya Fan", gender="女", specialties="脊柱理疗 · 瑜伽", specialties_en="Spinal therapy · Yoga", bio="以安全、循序渐进的练习帮助身体找回空间。", bio_en="Gentle, progressive practice for a more spacious body.", image_url="https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=640&q=80"),
                Teacher(name="王清", name_en="Wang Qing", gender="女", specialties="音疗 · 冥想", specialties_en="Sound healing · Meditation", bio="用声音与静默建立可持续的放松练习。", bio_en="Sustainable relaxation through sound and stillness.", image_url="https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=640&q=80"),
                Teacher(name="杨晓", name_en="Young Yang", gender="男", specialties="普拉提 · 私教", specialties_en="Pilates · Personal training", bio="强调动作质量与个体目标，而非高强度消耗。", bio_en="Movement quality and personal goals before intensity.", image_url="https://images.unsplash.com/photo-1567013127542-490d757e51fc?auto=format&fit=crop&w=640&q=80"),
            ])
        if db.query(Course).count() == 0:
            db.add_all([
                Course(course_type="group", name="八段锦", name_en="Eight Brocade", description="以传统导引动作舒展筋骨，配合自然呼吸，适合所有练习基础。", description_en="Traditional flowing movements and natural breathing, open to all levels.", duration_minutes=60, price=380, color="#49796a", image_url="https://images.unsplash.com/photo-1545205597-3d9d02c29597?auto=format&fit=crop&w=1000&q=80"),
                Course(course_type="group", name="瑜伽舒缓拉伸", name_en="Gentle Yoga", description="温和打开肩背与髋部，在一呼一吸之间释放紧张。", description_en="Gentle shoulder, back and hip opening with mindful breathing.", duration_minutes=75, price=380, color="#6c8b74", image_url="https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=1000&q=80"),
                Course(course_type="group", name="芳香音疗", name_en="Aroma Sound Healing", description="在植物香气与颂钵声中安静躺下，让神经系统慢下来。", description_en="Rest with botanical aromas and singing bowls as your nervous system slows down.", duration_minutes=60, price=380, color="#7a7191", image_url="https://images.unsplash.com/photo-1600618528240-fb9fc964b853?auto=format&fit=crop&w=1000&q=80"),
                Course(course_type="group", name="垫上普拉提", name_en="Mat Pilates", description="关注核心控制、身体排列与动作质量的小班练习。", description_en="Small-group practice for core control, alignment and movement quality.", duration_minutes=60, price=380, color="#41677a", image_url="https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=1000&q=80"),
                Course(course_type="private", name="1:1 私教（60 分钟）", name_en="1:1 Personal Training", description="根据个人体态与目标定制的一小时训练。", description_en="A fully personalised hour based on your body and goals.", duration_minutes=60, price=1180, color="#41677a"),
                Course(course_type="assessment", name="健康评估 Assessment", name_en="Wellness Assessment", description="从活动度、呼吸与生活方式建立个人健康基线。", description_en="A personal baseline of mobility, breath and lifestyle.", duration_minutes=60, price=1180, color="#a77350"),
                Course(course_type="workshop", name="芳香疗愈工作坊", name_en="Aromatherapy Workshop", description="认识日常植物香气，并调配自己的放松香氛。", description_en="Explore everyday botanicals and blend your own calming aroma.", duration_minutes=120, price=680, color="#a77350", image_url="https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?auto=format&fit=crop&w=1000&q=80"),
                Course(course_type="training", name="身心教练基础培训", name_en="Wellness Coach Foundation", description="面向练习者与教练的身心教学基础课程。", description_en="A foundation in wellness teaching for practitioners and coaches.", duration_minutes=480, price=6800, color="#925f55"),
            ])
        db.commit()
        if db.query(CardProduct).count() == 0:
            products = [
                ("团课单节", "Single Group Class", "group", 380, 30, 1, [], True),
                ("团课六次卡", "6 Group Classes", "group", 1278, 30, 6, [], True),
                ("团课十次卡", "10 Group Classes", "group", 2288, 30, 10, [], True),
                ("团课周卡", "Weekly Group Pass", "group", 999, 7, None, [], True),
                ("团课月卡", "Monthly Group Pass", "group", 3200, 30, None, [], True),
                ("团课年卡", "Annual Group Pass", "group", 28000, 365, None, [], False),
                ("10 节 1:1 私教", "10 Personal Training Sessions", "private", 11000, 365, 10, [], False),
                ("20 节 1:1 私教", "20 Personal Training Sessions", "private", 20000, 365, 20, [], False),
                ("健康评估单次", "Single Assessment", "assessment", 1180, 90, 1, [], True),
                ("工作坊 12 次卡", "12 Workshop Pass", "workshop", 6800, 365, 12, [], False),
                ("年度身心套餐", "Annual Wellness Package", "package", 38000, 365, None, [{"course_type": "assessment", "quantity": 4}, {"course_type": "group", "quantity": 365}, {"course_type": "private", "quantity": 20}, {"course_type": "workshop", "quantity": 3}], False),
            ]
            for name, name_en, category, price, days, total, benefits, online in products:
                db.add(CardProduct(name=name, name_en=name_en, category=category, price=price, original_price=price, validity_days=days, total_sessions=total, benefits_json=json.dumps(benefits), online_sale=online, description="有效期内按卡种权益预约，购卡价格和次数可由前台按实际成交调整。"))
        db.commit()
        if db.query(Member).count() == 0:
            advisors = {row.username: row.id for row in db.query(User).all()}
            db.add_all([
                Member(name="林安然", name_en="Grace Lin", phone="13900001001", gender="女", birth_date="1988-05-16", source="朋友推荐", advisor_id=advisors["frontdesk"], wechat="grace_lin", notes="肩颈容易紧张，签到时提醒准备薄外套。"),
                Member(name="陈屿", name_en="Yu Chen", phone="13900001002", gender="男", birth_date="1992-11-08", source="线上注册", advisor_id=advisors["frontdesk"], wechat="chenyu"),
                Member(name="周蔓", name_en="Man Zhou", phone="13900001003", gender="女", birth_date="1985-02-23", source="老会员转介", advisor_id=advisors["frontdesk"]),
                Member(name="吴清", name_en="Qing Wu", phone="13900001004", gender="女", birth_date="1996-09-12", source="大众点评"),
                Member(name="赵一", name_en="Yi Zhao", phone="13900001005", gender="男", birth_date="1990-07-30", source="企业活动"),
                Member(name="孙悦", name_en="Yue Sun", phone="13900001006", gender="女", birth_date="1993-12-19", source="线上注册"),
            ])
        db.commit()
        if db.query(ClassSession).count() == 0:
            courses = db.query(Course).all()
            teachers = db.query(Teacher).all()
            rooms = db.query(Room).all()
            by_type = {}
            for course in courses:
                by_type.setdefault(course.course_type, []).append(course)
            times = ["08:30", "10:15", "12:00", "15:00", "18:30"]
            for offset in range(7):
                day = add_days(today(), offset)
                for index in range(4):
                    course = by_type["group"][(offset + index) % len(by_type["group"])]
                    start = times[index + (offset % 2)]
                    end_hour = int(start[:2]) + (1 if course.duration_minutes == 60 else 2)
                    end = f"{end_hour:02d}:{start[3:]}" if course.duration_minutes == 60 else f"{int(start[:2]) + 1:02d}:{(int(start[3:]) + 15) % 60:02d}"
                    db.add(ClassSession(course_id=course.id, teacher_id=teachers[(offset + index) % len(teachers)].id, room_id=rooms[(index + offset) % 3].id, session_date=day, start_time=start, end_time=end, capacity=8 + (index % 3) * 2))
                db.add(ClassSession(course_id=by_type["private"][0].id, teacher_id=teachers[3].id, room_id=rooms[4].id, session_date=day, start_time="16:00", end_time="17:00", capacity=1))
            db.add(ClassSession(course_id=by_type["workshop"][0].id, teacher_id=teachers[2].id, room_id=rooms[3].id, session_date=add_days(today(), 2), start_time="14:00", end_time="16:00", capacity=16))
            db.add(ClassSession(course_id=by_type["assessment"][0].id, teacher_id=teachers[0].id, room_id=rooms[4].id, session_date=add_days(today(), 1), start_time="11:00", end_time="12:00", capacity=1))
            db.add(ClassSession(course_id=by_type["training"][0].id, teacher_id=teachers[0].id, room_id=rooms[3].id, session_date=add_days(today(), 4), start_time="09:00", end_time="17:00", capacity=20))
        db.commit()
        if db.query(Booking).count() == 0:
            members = db.query(Member).order_by(Member.id).all()
            products = db.query(CardProduct).all()
            group_product = next(row for row in products if row.name == "团课十次卡")
            private_product = next(row for row in products if row.name == "10 节 1:1 私教")
            monthly_product = next(row for row in products if row.name == "团课月卡")
            for member, product in zip(members[:4], [group_product, private_product, monthly_product, group_product]):
                issue_card(db, member=member, product=product, price=product.price, payment_method="wechat", starts_on=today(), note="演示购卡")
            db.commit()
            sessions = db.query(ClassSession).order_by(ClassSession.id).all()
            for index, session in enumerate(sessions[:18]):
                for member_index in range(min(session.capacity, 1 + index % 3)):
                    member = members[(index + member_index) % len(members)]
                    starts = datetime.fromisoformat(f"{session.session_date}T{session.start_time}:00")
                    if starts <= datetime.now():
                        booking = Booking(session_id=session.id, member_id=member.id, source="admin")
                        db.add(booking)
                        db.flush()
                    else:
                        booking = create_booking(db, session=session, member=member, source="admin")
                    if index == 0 and member_index == 0:
                        transition_booking(db, booking, "check_in", "seed")
            db.commit()
    finally:
        db.close()
