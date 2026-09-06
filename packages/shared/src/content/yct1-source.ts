/**
 * Bảng nguồn YCT 1 — gõ tay từ bản scan "YCT 1 SGK.pdf".
 *
 * QUY ƯỚC
 *  - hanzi / pinyin / glossEn : lấy nguyên văn từ sách  → origin "textbook"
 *  - meaningVi                : do AI dịch từ glossEn   → origin "ai_draft" (CHƯA DUYỆT)
 *  - extended = true          : mục có dấu * trong 词语表 (từ mở rộng)
 *  - pdfPage đếm từ 1; printedPage là số in trên trang (chuỗi)
 *
 * KHÔNG mục nào ở đây là "đã duyệt". Trạng thái xuất phát luôn là "draft".
 */

export const EDITION = {
  curriculumId: 'yct',
  level: 1,
  edition: 'standard-course',
  fileName: 'YCT 1 SGK.pdf',
  /** pdfPage = printedPage + PAGE_OFFSET, đã kiểm chứng ở 12 mốc (xem docs/source-audit.md §2) */
  pageOffset: 8,
} as const;

export interface LessonRow {
  n: number;
  titleZh: string;
  titlePinyin: string;
  titleEn: string;
  titleVi: string;
  printedStart: number;
  printedEnd: number;
  /** mục tiêu buổi học, viết cho trẻ 6–12 tuổi */
  goalsVi: string[];
}

export const LESSONS: LessonRow[] = [
  { n: 1, titleZh: '你好！', titlePinyin: 'Nǐ hǎo!', titleEn: 'Hello!', titleVi: 'Xin chào!', printedStart: 1, printedEnd: 4,
    goalsVi: ['Chào hỏi và tạm biệt bằng tiếng Trung', 'Đếm từ 1 đến 10'] },
  { n: 2, titleZh: '你叫什么？', titlePinyin: 'Nǐ jiào shénme?', titleEn: "What's your name?", titleVi: 'Bạn tên là gì?', printedStart: 5, printedEnd: 8,
    goalsVi: ['Hỏi và nói tên của mình', 'Nói “Rất vui được làm quen”'] },
  { n: 3, titleZh: '他是谁？', titlePinyin: 'Tā shì shéi?', titleEn: 'Who is he?', titleVi: 'Bạn ấy là ai?', printedStart: 9, printedEnd: 13,
    goalsVi: ['Hỏi “Ai đó?”', 'Nói người đó là người nước nào'] },
  { n: 4, titleZh: '我家有四口人。', titlePinyin: 'Wǒ jiā yǒu sì kǒu rén.', titleEn: 'There are four people in my family.', titleVi: 'Nhà mình có bốn người', printedStart: 14, printedEnd: 18,
    goalsVi: ['Gọi tên các thành viên trong nhà', 'Nói nhà mình có mấy người'] },
  { n: 5, titleZh: '我6岁。', titlePinyin: 'Wǒ liù suì.', titleEn: "I'm 6 years old.", titleVi: 'Mình sáu tuổi', printedStart: 19, printedEnd: 23,
    goalsVi: ['Hỏi và trả lời tuổi', 'Dùng 也 để nói “cũng vậy”'] },
  { n: 6, titleZh: '你的个子真高！', titlePinyin: 'Nǐ de gèzi zhēn gāo!', titleEn: "You're so tall!", titleVi: 'Bạn cao thật!', printedStart: 24, printedEnd: 28,
    goalsVi: ['Gọi tên các bộ phận trên khuôn mặt', 'Miêu tả to – nhỏ, dài – ngắn, cao'] },
  { n: 7, titleZh: '这是谁的狗？', titlePinyin: 'Zhè shì shéi de gǒu?', titleEn: 'Whose dog is this?', titleVi: 'Đây là chó của ai?', printedStart: 29, printedEnd: 33,
    goalsVi: ['Gọi tên bốn con vật quen thuộc', 'Hỏi “của ai” và chỉ “đây / kia”'] },
  { n: 8, titleZh: '我去商店。', titlePinyin: 'Wǒ qù shāngdiàn.', titleEn: "I'm going to the store.", titleVi: 'Mình đi cửa hàng', printedStart: 34, printedEnd: 38,
    goalsVi: ['Nói mình đang ở đâu', 'Nói mình đi đâu và rủ bạn cùng đi'] },
  { n: 9, titleZh: '今天星期几？', titlePinyin: 'Jīntiān xīngqī jǐ?', titleEn: 'What day is it today?', titleVi: 'Hôm nay là thứ mấy?', printedStart: 39, printedEnd: 43,
    goalsVi: ['Đọc tên bảy ngày trong tuần', 'Nói ngày sinh nhật của mình'] },
  { n: 10, titleZh: '现在几点？', titlePinyin: 'Xiànzài jǐ diǎn?', titleEn: 'What time is it?', titleVi: 'Bây giờ là mấy giờ?', printedStart: 44, printedEnd: 48,
    goalsVi: ['Hỏi và nói giờ', 'Hẹn giờ gặp nhau'] },
  { n: 11, titleZh: '你吃什么？', titlePinyin: 'Nǐ chī shénme?', titleEn: 'What would you like to eat?', titleVi: 'Bạn ăn gì?', printedStart: 49, printedEnd: 53,
    goalsVi: ['Gọi tên đồ ăn, đồ uống quen thuộc', 'Nói mình thích ăn / uống gì'] },
  { n: 12, titleZh: '复习', titlePinyin: 'Fùxí', titleEn: 'Review', titleVi: 'Ôn tập', printedStart: 54, printedEnd: 55,
    goalsVi: ['Ôn lại toàn bộ 11 bài'] },
];

/**
 * Từ vựng — nguồn: 词语表 Vocabulary, trang in 56–58 (pdf 64–66).
 * [lesson, hanzi, pinyin, glossEn, meaningVi, emoji, extended?]
 * Số bài suy ra từ cột trang của 词语表 đối chiếu khoảng trang của từng bài (không đoán).
 */
export type VocabRow = [number, string, string, string, string, string, boolean?];

export const VOCAB: VocabRow[] = [
  // ── Bài 1 (trang in 1) ─────────────────────────────────────────────
  [1, '一', 'yī', 'one', 'số một', '1️⃣'],
  [1, '二', 'èr', 'two', 'số hai', '2️⃣'],
  [1, '三', 'sān', 'three', 'số ba', '3️⃣'],
  [1, '四', 'sì', 'four', 'số bốn', '4️⃣'],
  [1, '五', 'wǔ', 'five', 'số năm', '5️⃣'],
  [1, '六', 'liù', 'six', 'số sáu', '6️⃣'],
  [1, '七', 'qī', 'seven', 'số bảy', '7️⃣'],
  [1, '八', 'bā', 'eight', 'số tám', '8️⃣'],
  [1, '九', 'jiǔ', 'nine', 'số chín', '9️⃣'],
  [1, '十', 'shí', 'ten', 'số mười', '🔟'],
  [1, '你', 'nǐ', 'you (singular)', 'bạn', '👤'],
  [1, '好', 'hǎo', 'good', 'tốt, khỏe', '👍'],
  [1, '老师', 'lǎoshī', 'teacher', 'thầy giáo, cô giáo', '👩‍🏫'],
  [1, '再见', 'zàijiàn', 'goodbye', 'tạm biệt', '👋'],
  // ── Bài 2 (trang in 5) ─────────────────────────────────────────────
  [2, '我', 'wǒ', 'I, me', 'mình, tôi', '🙋'],
  [2, '叫', 'jiào', 'to be called', 'tên là', '🏷️'],
  [2, '什么', 'shénme', 'what', 'gì, cái gì', '❓'],
  [2, '认识', 'rènshi', 'to know', 'quen, biết', '🤝'],
  [2, '很', 'hěn', 'very', 'rất', '❗'],
  [2, '高兴', 'gāoxìng', 'glad', 'vui', '😄'],
  [2, '她', 'tā', 'she, her', 'bạn ấy (con gái)', '👧'],
  [2, '吗', 'ma', '(a question particle)', 'trợ từ hỏi, đặt cuối câu', '❔'],
  [2, '不', 'bù', 'no, not', 'không', '🚫'],
  // ── Bài 3 (trang in 9) ─────────────────────────────────────────────
  [3, '他', 'tā', 'he, him', 'bạn ấy (con trai)', '👦'],
  [3, '是', 'shì', 'am, is, are', 'là', '✅'],
  [3, '谁', 'shéi', 'who, whom', 'ai', '🕵️'],
  [3, '哪', 'nǎ', 'which', 'nào', '🤔'],
  [3, '国', 'guó', 'country', 'nước, quốc gia', '🌏'],
  [3, '人', 'rén', 'person', 'người', '🧍'],
  [3, '中国人', 'Zhōngguó rén', 'Chinese people', 'người Trung Quốc', '🇨🇳'],
  // ── Bài 4 (trang in 14) ────────────────────────────────────────────
  [4, '爸爸', 'bàba', 'father', 'bố', '👨'],
  [4, '妈妈', 'māma', 'mother', 'mẹ', '👩'],
  [4, '家', 'jiā', 'family', 'nhà, gia đình', '🏠'],
  [4, '哥哥', 'gēge', 'big brother', 'anh trai', '🧑'],
  [4, '姐姐', 'jiějie', 'big sister', 'chị gái', '👩‍🦰'],
  [4, '妹妹', 'mèimei', 'littler sister', 'em gái', '👧', true],
  [4, '有', 'yǒu', 'to have', 'có', '✔️'],
  [4, '几', 'jǐ', 'how many (within 10)', 'mấy', '🔢'],
  [4, '口', 'kǒu', '(a measure word for family members)', 'lượng từ đếm người trong nhà', '👪'],
  [4, '和', 'hé', 'and', 'và', '➕'],
  [4, '没有', 'méiyǒu', "don't have", 'không có', '❌', true],
  [4, '个', 'ge', '(a measure word for general use)', 'cái, chiếc (lượng từ dùng chung)', '🧩'],
  // ── Bài 5 (trang in 19) ────────────────────────────────────────────
  [5, '岁', 'suì', 'year(s) old', 'tuổi', '🎂'],
  [5, '多大', 'duō dà', 'how old', 'bao nhiêu tuổi', '📏', true],
  [5, '也', 'yě', 'also, too', 'cũng', '🔁', true],
  // ── Bài 6 (trang in 24) ────────────────────────────────────────────
  [6, '头发', 'tóufa', 'hair', 'tóc', '💇'],
  [6, '鼻子', 'bízi', 'nose', 'mũi', '👃'],
  [6, '眼睛', 'yǎnjing', 'eye', 'mắt', '👁️'],
  [6, '手', 'shǒu', 'hand', 'bàn tay', '✋'],
  [6, '耳朵', 'ěrduo', 'ear', 'tai', '👂'],
  [6, '的', 'de', '(indicating a possessive relationship)', 'của (trợ từ sở hữu)', '🔗'],
  [6, '小', 'xiǎo', 'small', 'nhỏ', '🐜'],
  [6, '大', 'dà', 'big', 'to', '🐘'],
  [6, '长', 'cháng', 'long', 'dài', '📏'],
  [6, '个子', 'gèzi', 'height (for people)', 'chiều cao (của người)', '📐'],
  [6, '真', 'zhēn', 'really', 'thật là', '💯', true],
  [6, '高', 'gāo', 'tall', 'cao', '🦒'],
  // ── Bài 7 (trang in 29) ────────────────────────────────────────────
  [7, '猫', 'māo', 'cat', 'con mèo', '🐱'],
  [7, '狗', 'gǒu', 'dog', 'con chó', '🐶'],
  [7, '鱼', 'yú', 'fish', 'con cá', '🐟'],
  [7, '鸟', 'niǎo', 'bird', 'con chim', '🐦'],
  [7, '这', 'zhè', 'this', 'này, đây', '👉'],
  [7, '那', 'nà', 'that', 'kia, đó', '👈'],
  [7, '看', 'kàn', 'to look', 'nhìn, xem', '👀'],
  [7, '这儿', 'zhèr', 'here', 'ở đây', '📍'],
  [7, '多', 'duō', 'many, much', 'nhiều', '📚'],
  [7, '那儿', 'nàr', 'there', 'ở đó', '📌'],
  // ── Bài 8 (trang in 34) ────────────────────────────────────────────
  [8, '学校', 'xuéxiào', 'school', 'trường học', '🏫'],
  [8, '商店', 'shāngdiàn', 'store', 'cửa hàng', '🏪'],
  [8, '在', 'zài', 'in, at', 'ở (tại)', '📍'],
  [8, '谢谢', 'xièxie', 'to thank, thanks', 'cảm ơn', '🙏'],
  [8, '去', 'qù', 'to go', 'đi', '🚶'],
  [8, '你们', 'nǐmen', 'you (plural)', 'các bạn', '👥'],
  [8, '我们', 'wǒmen', 'we', 'chúng mình', '👫'],
  [8, '哪儿', 'nǎr', 'where', 'ở đâu', '🧭'],
  // ── Bài 9 (trang in 39) ────────────────────────────────────────────
  [9, '星期一', 'Xīngqīyī', 'Monday', 'thứ Hai', '📅'],
  [9, '星期二', "Xīngqī'èr", 'Tuesday', 'thứ Ba', '📅'],
  [9, '星期三', 'Xīngqīsān', 'Wednesday', 'thứ Tư', '📅'],
  [9, '星期四', 'Xīngqīsì', 'Thursday', 'thứ Năm', '📅'],
  [9, '星期五', 'Xīngqīwǔ', 'Friday', 'thứ Sáu', '📅'],
  [9, '星期六', 'Xīngqīliù', 'Saturday', 'thứ Bảy', '📅'],
  [9, '星期天', 'Xīngqītiān', 'Sunday', 'Chủ nhật', '📅'],
  [9, '生日', 'shēngrì', 'birthday', 'sinh nhật', '🎂', true],
  [9, '月', 'yuè', 'month', 'tháng', '🌙'],
  [9, '号', 'hào', 'date', 'ngày (trong tháng)', '🗓️'],
  [9, '今天', 'jīntiān', 'today', 'hôm nay', '📆'],
  [9, '星期', 'xīngqī', 'week', 'tuần, thứ', '🗓️'],
  [9, '明天', 'míngtiān', 'tomorrow', 'ngày mai', '🌅'],
  [9, '喜欢', 'xǐhuan', 'to like', 'thích', '💗'],
  // ── Bài 10 (trang in 44) ───────────────────────────────────────────
  [10, '现在', 'xiànzài', 'now', 'bây giờ', '⏰'],
  [10, '点', 'diǎn', "o'clock", 'giờ', '🕐'],
  [10, '分', 'fēn', 'minute', 'phút', '⏱️', true],
  [10, '见', 'jiàn', 'to meet', 'gặp', '🤝', true],
  [10, '早上', 'zǎoshang', 'morning', 'buổi sáng', '🌄', true],
  [10, '太早了', 'Tài zǎo le!', "It's too early!", 'Sớm quá!', '😪', true],
  // ── Bài 11 (trang in 49) ───────────────────────────────────────────
  [11, '米饭', 'mǐfàn', 'rice', 'cơm', '🍚'],
  [11, '面条', 'miàntiáo', 'noodle', 'mì, bún', '🍜'],
  [11, '苹果', 'píngguǒ', 'apple', 'quả táo', '🍎'],
  [11, '牛奶', 'niúnǎi', 'milk', 'sữa', '🥛'],
  [11, '水', 'shuǐ', 'water', 'nước', '💧'],
  [11, '吃', 'chī', 'to eat', 'ăn', '🥢'],
  [11, '喝', 'hē', 'to drink', 'uống', '🥤'],
  [11, '爱', 'ài', 'to love', 'yêu, rất thích', '❤️'],
  [11, '蛋糕', 'dàngāo', 'cake', 'bánh kem', '🍰', true],
];

/**
 * Câu mẫu — nguồn: "Key sentences" và "Let's read" của từng bài.
 * [lesson, hanzi, pinyin, glossEn, meaningVi, section, printedPage]
 * section: 'key' = Key sentences · 'dialogue' = Let's read
 */
export type SentenceRow = [number, string, string, string, string, 'key' | 'dialogue', number];

export const SENTENCES: SentenceRow[] = [
  // Bài 1
  [1, '你好！', 'Nǐ hǎo!', 'Hello!', 'Xin chào!', 'key', 1],
  [1, '再见！', 'Zàijiàn!', 'Goodbye!', 'Tạm biệt!', 'key', 1],
  [1, '老师好！', 'Lǎoshī hǎo!', 'Hello, teacher!', 'Em chào cô ạ!', 'dialogue', 2],
  // Bài 2
  [2, '你叫什么？', 'Nǐ jiào shénme?', "What's your name?", 'Bạn tên là gì?', 'key', 5],
  [2, '你认识她吗？', 'Nǐ rènshi tā ma?', 'Do you know her?', 'Bạn có quen bạn ấy không?', 'key', 5],
  [2, '我叫月月。', 'Wǒ jiào Yuèyue.', 'My name is Yueyue.', 'Mình tên là Nguyệt Nguyệt.', 'dialogue', 6],
  [2, '认识你很高兴！', 'Rènshi nǐ hěn gāoxìng!', 'Nice to meet you!', 'Rất vui được làm quen với bạn!', 'dialogue', 6],
  [2, '不认识。', 'Bù rènshi.', "I don't know her.", 'Mình không quen.', 'dialogue', 6],
  // Bài 3
  [3, '他是谁？', 'Tā shì shéi?', 'Who is he?', 'Bạn ấy là ai?', 'key', 9],
  [3, '成龙是哪国人？', 'Chéng Lóng shì nǎ guó rén?', "What is Jackie Chan's nationality?", 'Thành Long là người nước nào?', 'key', 9],
  [3, '他是成龙。', 'Tā shì Chéng Lóng.', 'He is Jackie Chan.', 'Chú ấy là Thành Long.', 'dialogue', 10],
  [3, '中国人。', 'Zhōngguó rén.', 'Chinese.', 'Người Trung Quốc.', 'dialogue', 10],
  // Bài 4
  [4, '你家有几口人？', 'Nǐ jiā yǒu jǐ kǒu rén?', 'How many people are there in your family?', 'Nhà bạn có mấy người?', 'key', 14],
  [4, '你有姐姐吗？', 'Nǐ yǒu jiějie ma?', 'Do you have big sisters?', 'Bạn có chị gái không?', 'key', 14],
  [4, '四口人，爸爸、妈妈、哥哥和我。', 'Sì kǒu rén, bàba, māma, gēge hé wǒ.', 'Four. Dad, mom, big brother and I.', 'Bốn người: bố, mẹ, anh trai và mình.', 'dialogue', 15],
  [4, '没有。我有一个妹妹。', 'Méiyǒu. Wǒ yǒu yí ge mèimei.', 'No. I have a little sister.', 'Không có. Mình có một em gái.', 'dialogue', 15],
  // Bài 5
  [5, '你几岁？', 'Nǐ jǐ suì?', 'How old are you?', 'Bạn mấy tuổi?', 'key', 19],
  [5, '你哥哥多大？', 'Nǐ gēge duō dà?', 'How old is your big brother?', 'Anh trai bạn bao nhiêu tuổi?', 'key', 19],
  [5, '我6岁。', 'Wǒ liù suì.', "I'm 6 years old.", 'Mình 6 tuổi.', 'dialogue', 20],
  [5, '他也6岁。', 'Tā yě liù suì.', "He's 6 years old, too.", 'Anh ấy cũng 6 tuổi.', 'dialogue', 20],
  // Bài 6
  [6, '妹妹的眼睛很小。', 'Mèimei de yǎnjing hěn xiǎo.', "Little sister's eyes are small.", 'Mắt em gái rất nhỏ.', 'key', 24],
  [6, '你的个子真高！', 'Nǐ de gèzi zhēn gāo!', "You're so tall!", 'Bạn cao thật đấy!', 'key', 24],
  [6, '手不大，头发不长。', 'Shǒu bù dà, tóufa bù cháng.', 'Hands are not big, and hair is not long.', 'Bàn tay không to, tóc không dài.', 'dialogue', 25],
  [6, '你的鼻子真长！', 'Nǐ de bízi zhēn cháng!', 'Your nose is so long!', 'Mũi bạn dài thật đấy!', 'dialogue', 25],
  // Bài 7
  [7, '这是谁的狗？', 'Zhè shì shéi de gǒu?', 'Whose dog is this?', 'Đây là chó của ai?', 'key', 29],
  [7, '这儿有很多小鱼。', 'Zhèr yǒu hěn duō xiǎo yú.', 'There are lots of fish here.', 'Ở đây có rất nhiều cá nhỏ.', 'key', 29],
  [7, '这是我的狗。', 'Zhè shì wǒ de gǒu.', 'This is my dog.', 'Đây là chó của mình.', 'dialogue', 30],
  [7, '那是谁的猫？', 'Nà shì shéi de māo?', 'Whose cat is that?', 'Kia là mèo của ai?', 'dialogue', 30],
  [7, '那儿有很多小鸟。', 'Nàr yǒu hěn duō xiǎo niǎo.', 'There are many birds there.', 'Ở đó có rất nhiều chim nhỏ.', 'dialogue', 30],
  // Bài 8
  [8, '你姐姐在家吗？', 'Nǐ jiějie zài jiā ma?', 'Is your big sister at home?', 'Chị gái bạn có ở nhà không?', 'key', 34],
  [8, '我去商店。', 'Wǒ qù shāngdiàn.', "I'm going to the store.", 'Mình đi cửa hàng.', 'key', 34],
  [8, '不在，她在学校。', 'Bú zài, tā zài xuéxiào.', 'No. She is at school.', 'Không ạ, chị ấy ở trường.', 'dialogue', 35],
  [8, '不去。我们在家。', 'Bú qù. Wǒmen zài jiā.', "No, we aren't. We are at home.", 'Không đi ạ. Chúng con ở nhà.', 'dialogue', 35],
  // Bài 9
  [9, '你的生日是几月几号？', 'Nǐ de shēngrì shì jǐ yuè jǐ hào?', 'When is your birthday?', 'Sinh nhật bạn ngày mấy tháng mấy?', 'key', 39],
  [9, '今天星期几？', 'Jīntiān xīngqī jǐ?', 'What day is it today?', 'Hôm nay là thứ mấy?', 'key', 39],
  [9, '1月1号。', 'Yī yuè yī hào.', 'January 1.', 'Ngày 1 tháng 1.', 'dialogue', 40],
  [9, '今天星期五。', 'Jīntiān Xīngqīwǔ.', 'Today is Friday.', 'Hôm nay là thứ Sáu.', 'dialogue', 40],
  [9, '明天星期六，我喜欢星期六。', 'Míngtiān Xīngqīliù, wǒ xǐhuan Xīngqīliù.', 'Tomorrow will be Saturday. I like Saturday.', 'Mai là thứ Bảy, mình thích thứ Bảy.', 'dialogue', 40],
  // Bài 10
  [10, '现在几点？', 'Xiànzài jǐ diǎn?', 'What time is it?', 'Bây giờ là mấy giờ?', 'key', 44],
  [10, '明天5点见。', 'Míngtiān wǔ diǎn jiàn.', "Let's meet at 5 o'clock tomorrow.", 'Mai 5 giờ gặp nhé.', 'key', 44],
  [10, '11点10分。', 'Shíyī diǎn shí fēn.', 'Ten past eleven.', '11 giờ 10 phút.', 'dialogue', 45],
  [10, '早上5点。', 'Zǎoshang wǔ diǎn.', "Five o'clock in the morning.", '5 giờ sáng.', 'dialogue', 45],
  [10, '太早了！', 'Tài zǎo le!', "It's too early!", 'Sớm quá!', 'dialogue', 45],
  // Bài 11
  [11, '你吃什么？', 'Nǐ chī shénme?', 'What would you like to eat?', 'Bạn ăn gì?', 'key', 49],
  [11, '我爱吃蛋糕。', 'Wǒ ài chī dàngāo.', 'I like to eat cakes.', 'Mình rất thích ăn bánh kem.', 'key', 49],
  [11, '我吃苹果。', 'Wǒ chī píngguǒ.', "I'd like to eat apples.", 'Mình ăn táo.', 'dialogue', 50],
  [11, '牛奶和水，你喝哪个？', 'Niúnǎi hé shuǐ, nǐ hē nǎge?', 'What would you like to drink, milk or water?', 'Sữa và nước, bạn uống cái nào?', 'dialogue', 50],
  [11, '我喝牛奶。', 'Wǒ hē niúnǎi.', "I'd like to drink milk.", 'Mình uống sữa.', 'dialogue', 50],
  [11, '今天是爸爸的生日，吃面条。', 'Jīntiān shì bàba de shēngrì, chī miàntiáo.', "Today is your dad's birthday. We eat noodles.", 'Hôm nay là sinh nhật bố, nhà mình ăn mì.', 'dialogue', 50],
];

/**
 * Ngữ pháp / mẫu câu — **teacher_authored draft**, KHÔNG phải danh mục ngữ pháp của sách.
 * Rút ra từ Key sentences của chính bài đó; chỉ dùng từ đã học trong bài hoặc bài trước.
 * [lesson, promptVi, sentenceWithBlank, correct, wrongs, explainVi]
 */
export type GrammarRow = [number, string, string, string, string[], string];

export const GRAMMAR: GrammarRow[] = [
  [1, 'Chào cô giáo thế nào?', '老师___！', '好', ['再见', '你', '十'], 'Chào ai đó: gọi tên/chức danh rồi thêm 好. 老师好！= Em chào cô ạ!'],
  [1, 'Khi chia tay, bạn nói gì?', '___！', '再见', ['你好', '老师', '九'], '再见 zàijiàn dùng khi tạm biệt.'],
  [2, 'Hỏi tên một bạn mới quen:', '你叫___？', '什么', ['谁', '哪', '几'], '什么 hỏi về sự vật, tên gọi. Mẫu câu: 你叫什么？'],
  [2, 'Biến câu thành câu hỏi có / không:', '你认识她___？', '吗', ['什么', '很', '不'], 'Thêm 吗 vào cuối câu kể để thành câu hỏi có/không.'],
  [2, 'Nói “mình không quen”:', '___认识。', '不', ['很', '吗', '叫'], 'Phủ định đặt 不 ngay trước động từ: 不认识.'],
  [3, 'Hỏi về một người:', '他是___？', '谁', ['什么', '哪', '几'], '谁 shéi hỏi về người; 什么 hỏi về vật.'],
  [3, 'Hỏi quốc tịch:', '他是___国人？', '哪', ['谁', '什么', '很'], '哪 + danh từ = “nào”. 哪国人 = người nước nào.'],
  [4, 'Đếm người trong gia đình:', '我家有四___人。', '口', ['个', '岁', '多'], '口 kǒu là lượng từ riêng để đếm người trong một nhà.'],
  [4, 'Hỏi số lượng nhỏ (dưới 10):', '你家有___口人？', '几', ['什么', '谁', '哪'], '几 hỏi số lượng nhỏ, thường dưới 10.'],
  [4, 'Nói “không có”:', '___。我有一个妹妹。', '没有', ['不有', '不是', '没是'], 'Phủ định của 有 luôn là 没有, không nói “不有”.'],
  [5, 'Hỏi tuổi một bạn nhỏ:', '你___岁？', '几', ['多', '什么', '哪'], 'Hỏi tuổi trẻ em dùng 几岁; hỏi người lớn hơn dùng 多大.'],
  [5, 'Nói “anh ấy cũng 6 tuổi”:', '他___6岁。', '也', ['很', '不', '和'], '也 đứng trước động từ hoặc số lượng, nghĩa là “cũng”.'],
  [6, 'Nói “mắt của em gái”:', '妹妹___眼睛', '的', ['和', '很', '也'], '的 nối người sở hữu với vật: A 的 B = B của A.'],
  [6, 'Khen bạn cao:', '你的个子___高！', '真', ['不', '几', '哪'], '真 + tính từ dùng để khen, cảm thán: 真高！'],
  [7, 'Hỏi “của ai”:', '这是___的狗？', '谁', ['什么', '哪', '几'], '谁的 + danh từ = “của ai”.'],
  [7, 'Nói ở đây có nhiều cá:', '这儿___很多小鱼。', '有', ['是', '在', '去'], 'Nơi chốn + 有 + sự vật: dùng để nói ở đâu có gì.'],
  [8, 'Hỏi chị gái có ở nhà không:', '你姐姐___家吗？', '在', ['是', '去', '有'], '在 + nơi chốn để nói ai/cái gì đang ở đâu.'],
  [8, 'Nói mình đi cửa hàng:', '我___商店。', '去', ['在', '是', '有'], '去 + nơi chốn = đi đến đâu đó.'],
  [9, 'Hỏi hôm nay thứ mấy:', '今天星期___？', '几', ['什么', '哪', '谁'], 'Hỏi thứ trong tuần luôn dùng 星期几, không dùng 什么.'],
  [9, 'Hỏi ngày sinh nhật:', '你的生日是几月几___？', '号', ['月', '岁', '点'], 'Thứ tự tiếng Trung: 月 (tháng) rồi 号 (ngày).'],
  [10, 'Hỏi mấy giờ:', '现在几___？', '点', ['分', '号', '岁'], '点 dùng cho giờ, 分 dùng cho phút.'],
  [10, 'Nói 11 giờ 10 phút:', '11点10___。', '分', ['点', '号', '月'], 'Cách nói giờ: số + 点 + số + 分.'],
  [11, 'Hỏi bạn ăn gì:', '你___什么？', '吃', ['喝', '看', '去'], '吃 dùng cho đồ ăn, 喝 dùng cho đồ uống.'],
  [11, 'Nói mình rất thích ăn bánh:', '我___吃蛋糕。', '爱', ['很', '也', '和'], '爱 + động từ diễn tả rất thích làm việc gì.'],
];

/** Ghi chú biến điệu / cách đọc — hiển thị dưới nhãn “Mẹo đọc”, không phải nguồn gốc chữ. */
export const PINYIN_NOTES: Record<string, string> = {
  '不': '不 đọc “bù”, nhưng trước thanh 4 đổi thành “bú” (不在 → bú zài).',
  '一': '一 đọc “yī”, nhưng trước lượng từ thanh 4 đổi thành “yí” (一个 → yí ge).',
  '个': 'Trong 一个 đọc khinh thanh “ge”; khi đứng riêng đọc “gè”.',
  '她': '她 và 他 đọc giống hệt nhau (tā) — phải nhìn chữ mới phân biệt được.',
  '他': '他 và 她 đọc giống hệt nhau (tā) — phải nhìn chữ mới phân biệt được.',
};
