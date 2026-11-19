import type { ActivityEngineType, ActivityItem, GameActivity } from "./activity-types";
import { flashcardImageUrl } from "./flashcard-images";
import { encodeLanguageMap, type LanguageProgression } from "./language-map";
import type { CourseDay, CurriculumSection, LearningPhase, LessonResource, SyllabusDocument, SyllabusLesson, SyllabusMeta, SyllabusUnit, TestSkill, VocabularyTier, VocabCard } from "./syllabus-types";

type Pair = [string, string];

type StarterUnitSource = {
  title: string;
  topic: string;
  overview: string;
  objectives: string[];
  communicationGoal: string;
  lessonCount: number;
  courseNumber: 1 | 2;
  core: Pair[];
  supporting: Pair[];
  exposure: string[];
  language: LanguageProgression;
  coreProduction: string[];
  expandedProduction: string[];
  grammar: string[];
  skills: string[];
  recycle: string[];
  story: string;
  songs: string[];
  tpr: string[];
  classroomEnglish: string[];
  phonics: string[];
  sources: Array<[string, string]>;
  sourceNotes?: string[];
};

const units: StarterUnitSource[] = [
  {
    title: "UNIT 1 I LOVE ANIMALS!", topic: "Animals, counting and position", courseNumber: 1, lessonCount: 3,
    overview: "Nhận biết động vật, nói con vật yêu thích, đếm và mô tả vị trí đơn giản.",
    objectives: ["Nhận biết và gọi tên động vật.", "Hỏi và nói về con vật yêu thích.", "Đếm động vật và mô tả vị trí đơn giản."],
    communicationGoal: "Học viên hỏi–đáp về con vật yêu thích, số lượng và vị trí bằng câu đủ sức.",
    core: [["frog","con ếch"],["duck","con vịt"],["lizard","thằn lằn"],["tiger","con hổ"],["sheep","con cừu"],["horse","con ngựa"],["goat","con dê"],["cow","con bò"],["mouse / mice","chuột"],["giraffe","hươu cao cổ"],["zebra","ngựa vằn"],["elephant","con voi"]],
    supporting: [["bird","con chim"],["hippo","hà mã"],["crocodile","cá sấu"],["snake","con rắn"],["spider","con nhện"],["fish","cá"],["in","ở trong"],["on","ở trên"],["under","ở dưới"],["next to","ở bên cạnh"]],
    exposure: ["favourite", "there is", "there are", "how many"],
    language: {
      WORD: "frog", CHUNK: "a frog", SENTENCE: "It's a frog.", EXPANDED_SENTENCE: "I see a big frog.",
      QA: "What's your favourite animal? → I like frogs.", PERSONAL: "I like frogs.",
      COMMUNICATION: "What's your favourite animal? → I like frogs.\nWhat about you?",
    },
    coreProduction: ["I like _____.", "It's a _____.", "There is one.", "There are _____."],
    expandedProduction: ["My favourite animal is a frog.", "I see a big elephant.", "The frog is under the tree."],
    grammar: ["A / AN", "Plural nouns", "There is / There are", "Prepositions of place"],
    skills: ["Listening: chọn tranh / tô màu", "Speaking: favourite + how many", "Reading: Yes/No theo tranh"],
    recycle: ["Colours", "Numbers 1–20"], story: "Chuyến đi sở thú: chỉ, đếm, tìm con vật.", songs: ["Walking in the Jungle"],
    tpr: ["Jump like a frog.", "Walk like an elephant.", "Point to the tiger."], classroomEnglish: ["What do you see?", "How many?", "Point to …"], phonics: ["s", "a", "t"],
    sources: [["Lesson 1 — Animals","https://www.youtube.com/watch?v=a2k9wJuAsr8"],["Homework L1","https://www.youtube.com/watch?v=gLNavXfjbEE"]],
  },
  {
    title: "UNIT 2 AT HOME", topic: "Homes, rooms and household objects", courseNumber: 1, lessonCount: 3,
    overview: "Nói về loại nhà, phòng, đồ vật và vị trí trong nhà.",
    objectives: ["Gọi tên nhà, phòng và đồ vật.", "Nói mình sống ở house hay flat.", "Hỏi vị trí và hoạt động theo phòng."],
    communicationGoal: "Học viên giới thiệu ngôi nhà và hỏi–đáp nơi sinh hoạt.",
    core: [["house","nhà"],["home","nơi ở"],["apartment / flat","căn hộ"],["living room","phòng khách"],["bedroom","phòng ngủ"],["kitchen","nhà bếp"],["bathroom","phòng tắm"],["dining room","phòng ăn"],["garden","vườn"],["door","cửa"],["window","cửa sổ"],["table","bàn"]],
    supporting: [["wall","tường"],["armchair","ghế bành"],["cupboard","tủ"],["bookcase","tủ sách"],["rug","thảm"],["lamp","đèn"],["clock","đồng hồ"],["picture","tranh"],["mirror","gương"],["box","hộp"]],
    exposure: ["There is a small garden.", "There are three rooms."],
    language: {
      WORD: "house", CHUNK: "a house", SENTENCE: "It's a house.", EXPANDED_SENTENCE: "I live in a house with a small garden.",
      QA: "Do you live in a house or a flat? → I live in a house.", PERSONAL: "I live in a house.",
      COMMUNICATION: "Where do you sleep? → I sleep in the bedroom.\nWhat about you?",
    },
    coreProduction: ["I live in a _____.", "I sleep in the _____.", "It's on the _____."],
    expandedProduction: ["I live in a house with a small garden.", "The clock is on the wall."],
    grammar: ["There is / There are", "Prepositions", "Present simple", "Where"],
    skills: ["Listening: vị trí đồ vật", "Speaking: mô tả nhà", "Reading: tick/cross"],
    recycle: ["Colours", "Animals", "big / little"], story: "Một ngày trong nhà.", songs: ["This Is My House"],
    tpr: ["Open the door.", "Sit on the chair.", "Go to the kitchen."], classroomEnglish: ["Where is it?", "Put it on the table."], phonics: ["p", "i", "n"],
    sources: [["L1 / Homework L1","https://www.youtube.com/watch?v=hIbazKhQ0M0"],["L2","https://www.youtube.com/watch?v=S4PG52VDO3o"]],
  },
  {
    title: "UNIT 3 FAMILY AND FRIENDS", topic: "Family and relationships", courseNumber: 1, lessonCount: 2,
    overview: "Giới thiệu người trong gia đình và quan hệ họ hàng.",
    objectives: ["Nhận biết thành viên gia đình.", "Giới thiệu và hỏi về người trong gia đình."],
    communicationGoal: "Học viên chỉ ảnh và nói This is my mum. / He is my grandpa.",
    core: [["family","gia đình"],["dad / father","bố"],["mum / mother","mẹ"],["parents","bố mẹ"],["brother","anh/em trai"],["sister","chị/em gái"],["baby","em bé"],["grandfather / grandpa","ông"],["grandmother / grandma","bà"],["grandparents","ông bà"]],
    supporting: [["boy","cậu bé"],["girl","cô bé"],["uncle","chú"],["aunt","cô"],["cousin","anh/chị họ"],["child / children","trẻ em"]],
    exposure: ["I", "you", "he", "she", "my", "your"],
    language: {
      WORD: "mum", CHUNK: "my mum", SENTENCE: "This is my mum.", EXPANDED_SENTENCE: "These are my parents.",
      QA: "Who is she? → She is my mum.", PERSONAL: "This is my family.",
      COMMUNICATION: "Who is he? → He is my grandpa.\nWhat about you?",
    },
    coreProduction: ["This is my _____.", "He is my _____.", "She is my _____."],
    expandedProduction: ["These are my parents.", "This is my grandfather."],
    grammar: ["Subject pronouns", "Possessive adjectives", "AM / IS / ARE", "This / These"],
    skills: ["Speaking: giới thiệu gia đình", "Listening: nhận diện người", "Reading: sơ đồ gia đình"],
    recycle: ["Names", "Colours", "boy / girl"], story: "Gia đình chào nhau buổi sáng.", songs: ["Finger Family"],
    tpr: ["Point to mum.", "Show me grandpa.", "Wave to your family."], classroomEnglish: ["Who is he?", "Who is she?"], phonics: ["m", "d", "g"],
    sources: [["Family word bank","https://yourhomework.net/vocab/271436109"],["Homework L2","https://www.youtube.com/watch?v=ZGz285TMQI4&t=301s"]],
  },
  {
    title: "UNIT 4 FOOD!", topic: "Meals, food and drink", courseNumber: 1, lessonCount: 3,
    overview: "Gọi tên đồ ăn, thức uống, nói món yêu thích và đáp lời mời.",
    objectives: ["Gọi tên đồ ăn và bữa ăn.", "Nói món yêu thích.", "Mời và đáp lại lời mời."],
    communicationGoal: "Học viên nói I like juice. / Yes, please. / No, thank you.",
    core: [["breakfast","bữa sáng"],["lunch","bữa trưa"],["dinner","bữa tối"],["bread","bánh mì"],["rice","cơm"],["burger","bánh burger"],["fish","cá"],["cake","bánh"],["milk","sữa"],["water","nước"],["juice","nước trái cây"],["fruit","trái cây"]],
    supporting: [["chips","khoai tây chiên"],["sausage","xúc xích"],["chocolate","sô-cô-la"],["grapes","nho"],["mango","xoài"],["apple","táo"],["banana","chuối"],["carrot","cà rốt"]],
    exposure: ["Would you like some …?", "some", "any", "please", "thank you"],
    language: {
      WORD: "juice", CHUNK: "some juice", SENTENCE: "I like juice.", EXPANDED_SENTENCE: "I eat bread for breakfast.",
      QA: "What's your favourite food? → I like juice.", PERSONAL: "I like cake.",
      COMMUNICATION: "Would you like some juice? → Yes, please.\nWhat about you?",
    },
    coreProduction: ["I like _____.", "I eat _____.", "Yes, please.", "No, thank you."],
    expandedProduction: ["I eat bread for breakfast.", "Would you like some juice?"],
    grammar: ["Some / Any", "A / AN", "Like / Likes", "Present simple"],
    skills: ["Listening: tick hình", "Speaking: món yêu thích và lời mời", "Reading: Yes/No"],
    recycle: ["Colours", "I like …", "Family"], story: "Bữa tiệc nhỏ: chọn và mời.", songs: ["Are You Hungry?"],
    tpr: ["Eat the apple.", "Drink the milk.", "Pass the cake."], classroomEnglish: ["Are you hungry?", "Say please."], phonics: ["o", "c", "k"],
    sources: [["L1","https://www.youtube.com/watch?v=Yken3OPxSRA"],["L2","https://www.youtube.com/watch?v=O3iNXa3TBLA&t=1242s"]],
    sourceNotes: ["Từ chuyển tiếp clothes giữ Exposure, dạy chính ở Unit 5."],
  },
  {
    title: "UNIT 5 I LIKE CLOTHES", topic: "Clothes, colours and appearance", courseNumber: 1, lessonCount: 2,
    overview: "Gọi tên trang phục và mô tả người đang mặc gì.",
    objectives: ["Gọi tên quần áo và màu.", "Mô tả mình/người khác đang mặc gì."],
    communicationGoal: "Học viên nói I'm wearing a red T-shirt.",
    core: [["clothes","quần áo"],["T-shirt","áo phông"],["shirt","áo sơ mi"],["hat","mũ"],["jacket","áo khoác"],["skirt","chân váy"],["dress","váy"],["jeans","quần jean"],["trousers","quần dài"],["socks","tất"],["shoes","giày"],["glasses","kính"]],
    supporting: [["watch","đồng hồ"],["bag","túi"],["black","đen"],["blue","xanh dương"],["white","trắng"],["red","đỏ"],["yellow","vàng"],["green","xanh lá"]],
    exposure: ["body", "hair", "foot", "feet"],
    language: {
      WORD: "T-shirt", CHUNK: "a red T-shirt", SENTENCE: "It's a red T-shirt.", EXPANDED_SENTENCE: "I'm wearing a red T-shirt.",
      QA: "What are you wearing? → I'm wearing a red T-shirt.", PERSONAL: "I'm wearing a white skirt.",
      COMMUNICATION: "What is she wearing? → She is wearing a yellow shirt.\nWhat about you?",
    },
    coreProduction: ["I'm wearing _____.", "He is wearing _____.", "It's a _____ _____."],
    expandedProduction: ["I'm wearing a white skirt and a yellow shirt."],
    grammar: ["Present continuous with wear", "AM / IS / ARE", "Colour + noun"],
    skills: ["Listening: nối tên-người", "Speaking: mô tả trang phục", "Reading: Yes/No"],
    recycle: ["Colours", "Family", "he / she"], story: "Mặc đồ đi chơi.", songs: ["What Are You Wearing?"],
    tpr: ["Put on your hat.", "Point to your shoes.", "Show me a red T-shirt."], classroomEnglish: ["What colour is it?", "Stand up."], phonics: ["e", "u", "r"],
    sources: [["L2 / Homework L2","https://www.youtube.com/watch?v=xZ8jY8O_Lt4"]],
  },
  {
    title: "UNIT 6 LOOK AT US!", topic: "Body and appearance", courseNumber: 1, lessonCount: 2,
    overview: "Gọi tên bộ phận cơ thể và mô tả ngoại hình bằng have got.",
    objectives: ["Gọi tên bộ phận cơ thể.", "Dùng have got/has got để nói đặc điểm."],
    communicationGoal: "Học viên nói She's got brown hair and blue eyes.",
    core: [["body","cơ thể"],["head","đầu"],["face","khuôn mặt"],["hair","tóc"],["eyes","mắt"],["ears","tai"],["nose","mũi"],["mouth","miệng"],["arms","cánh tay"],["hands","bàn tay"],["legs","chân"],["foot / feet","bàn chân"]],
    supporting: [["teeth","răng"],["smile","nụ cười"],["wave","vẫy tay"]],
    exposure: ["teacher", "classroom", "ruler", "pen", "pencil"],
    language: {
      WORD: "hair", CHUNK: "brown hair", SENTENCE: "She's got brown hair.", EXPANDED_SENTENCE: "She's got long black hair and blue eyes.",
      QA: "What does she look like? → She's got brown hair.", PERSONAL: "I've got brown eyes.",
      COMMUNICATION: "Has he got blue eyes? → Yes, he has.\nWhat about you?",
    },
    coreProduction: ["This is my _____.", "He's got _____.", "Touch your _____."],
    expandedProduction: ["She's got long black hair and blue eyes."],
    grammar: ["Have got / Has got", "Question forms", "Adjective order"],
    skills: ["Speaking: mô tả nhân vật", "Listening: đặc điểm", "Reading: điền từ"],
    recycle: ["Colours", "Clothes", "he / she"], story: "Nhìn gương và mô tả bạn.", songs: ["Head Shoulders Knees and Toes"],
    tpr: ["Touch your nose.", "Clap your hands.", "Wave your arms."], classroomEnglish: ["Look at me.", "What colour is her hair?"], phonics: ["h", "b", "f"],
    sources: [["Homework L1","https://www.youtube.com/watch?v=z6VH9HqMsK0&t=1s"]],
  },
  {
    title: "UNIT 7 WE LOVE SCHOOL", topic: "School people, objects and actions", courseNumber: 1, lessonCount: 3,
    overview: "Gọi tên đồ dùng, người và chỉ vật gần/xa ở trường.",
    objectives: ["Gọi tên đồ dùng và người ở trường.", "Phân biệt this/that/these/those."],
    communicationGoal: "Học viên nói This is a ruler. / They are books.",
    core: [["teacher","giáo viên"],["classroom","lớp học"],["board","bảng"],["book","sách"],["ruler","thước"],["eraser / rubber","tẩy"],["pen","bút mực"],["pencil","bút chì"],["crayon","bút sáp"],["computer","máy tính"],["bag","cặp"],["chair","ghế"]],
    supporting: [["page","trang"],["line","dòng"],["open","mở"],["close","đóng"],["draw","vẽ"],["keyboard","bàn phím"]],
    exposure: ["What's this?", "What's that?", "What are these/those?"],
    language: {
      WORD: "pencil", CHUNK: "a red pencil", SENTENCE: "This is a pencil.", EXPANDED_SENTENCE: "This is my red pencil.",
      QA: "What's this? → It's a pencil.", PERSONAL: "This is my book.",
      COMMUNICATION: "What are these? → They are books.\nWhat about you?",
    },
    coreProduction: ["This is a _____.", "That is a _____.", "They are _____."],
    expandedProduction: ["This is my red pencil.", "Those are the books on the table."],
    grammar: ["This / That / These / Those", "A / AN", "Plural nouns"],
    skills: ["Listening: tick tranh", "Speaking: chỉ và gọi tên", "Reading: viết từ"],
    recycle: ["Colours", "Home objects", "Numbers"], story: "Buổi học đầu tuần.", songs: ["Hello Teacher"],
    tpr: ["Open your book.", "Close your bag.", "Point to the board."], classroomEnglish: ["What's this?", "Look at the board."], phonics: ["l", "j", "v"],
    sources: [["L1","https://www.youtube.com/watch?v=jh2iDlOMNYg&t=420s"],["Homework L2","https://www.youtube.com/watch?v=z3CzwF_eLbw"]],
  },
  {
    title: "UNIT 8 IN THE PLAYGROUND", topic: "Sports, ability and actions", courseNumber: 1, lessonCount: 3,
    overview: "Nói về thể thao, khả năng can/can't và hành động đang diễn ra.",
    objectives: ["Gọi tên môn thể thao.", "Nói khả năng bằng can/can't.", "Mô tả hành động bằng present continuous."],
    communicationGoal: "Học viên nói I can swim. / She is running.",
    core: [["basketball","bóng rổ"],["football / soccer","bóng đá"],["tennis","quần vợt"],["badminton","cầu lông"],["running","chạy"],["walking","đi bộ"],["riding","đạp/cưỡi"],["fishing","câu cá"],["jump","nhảy"],["bike","xe đạp"],["ball","bóng"],["park","công viên"]],
    supporting: [["hitting","đánh"],["kicking","đá"],["bouncing","nảy bóng"],["table tennis","bóng bàn"]],
    exposure: ["What can you do?", "What is he/she doing?"],
    language: {
      WORD: "run", CHUNK: "I can run", SENTENCE: "I can run.", EXPANDED_SENTENCE: "She is running in the park.",
      QA: "What can you do? → I can swim.", PERSONAL: "I can ride a bike.",
      COMMUNICATION: "What is he doing? → He is playing football.\nWhat about you?",
    },
    coreProduction: ["I can _____.", "I can't _____.", "He is _____."],
    expandedProduction: ["She is running in the park.", "I can ride a bike."],
    grammar: ["Can / Can't", "Present continuous", "AM / IS / ARE"],
    skills: ["Listening: hành động", "Speaking: ability interview", "Reading: tranh và câu"],
    recycle: ["Body", "Colours", "I like …"], story: "Một ngày ở sân chơi.", songs: ["I Can Run"],
    tpr: ["Run.", "Jump.", "Kick a ball.", "Ride a bike."], classroomEnglish: ["What are you doing?", "Can you …?"], phonics: ["w", "x", "y"],
    sources: [["Homework L1","https://www.youtube.com/watch?v=IpFdxnCdUdE&t=471s"],["Homework L2","https://www.youtube.com/watch?v=_0pwAH5ijNI&t=214s"]],
  },
  {
    title: "UNIT 9 MY HOBBIES", topic: "Hobbies and action phrases", courseNumber: 1, lessonCount: 2,
    overview: "Nói về sở thích với like/likes + V-ing, rồi tái sử dụng để kể về bản thân.",
    objectives: ["Nói sở thích với like/likes.", "Ôn khả năng và hành động đang diễn ra."],
    communicationGoal: "Học viên nói He likes listening to music. / Do you like …?",
    core: [["read a book","đọc sách"],["listen to music","nghe nhạc"],["ride a bike","đạp xe"],["fly a kite","thả diều"],["kick a ball","đá bóng"],["take a photo","chụp ảnh"],["sing a song","hát"],["watch TV","xem TV"],["swim","bơi"],["draw","vẽ"],["play","chơi"],["run","chạy"]],
    supporting: [["write a name","viết tên"],["walk a dog","dắt chó"],["catch a ball","bắt bóng"],["wave hello","vẫy chào"]],
    exposure: ["Do you like …?", "Does he/she like …?"],
    language: {
      WORD: "swim", CHUNK: "like swimming", SENTENCE: "I like swimming.", EXPANDED_SENTENCE: "He likes listening to music.",
      QA: "Do you like swimming? → Yes, I do.", PERSONAL: "I like riding a bike.",
      COMMUNICATION: "What do you like doing? → I like swimming.\nWhat about you?",
    },
    coreProduction: ["I like _____.", "She likes _____.", "Do you like _____?"],
    expandedProduction: ["He likes listening to music.", "I like swimming in the sea."],
    grammar: ["Like / Likes", "Do / Does", "Can / Can't", "Present continuous"],
    skills: ["Speaking: phỏng vấn sở thích", "Listening: người-hoạt động", "Reading: Yes/No"],
    recycle: ["Sports", "Action verbs", "Unit 8"], story: "Hỏi bạn thích làm gì.", songs: ["What Do You Like?"],
    tpr: ["Read a book.", "Sing a song.", "Take a photo."], classroomEnglish: ["What do you like?", "Your turn."], phonics: ["z", "qu", "ch"],
    sources: [["Homework L1","https://www.youtube.com/watch?v=_0pwAH5ijNI&t=214s"]],
    sourceNotes: ["Buổi 24 gắn Unit 9: reuse speaking và personal language."],
  },
  {
    title: "UNIT 10 YOUR DAY", topic: "Source-verified beach actions", courseNumber: 2, lessonCount: 2,
    overview: "Giữ tên Unit vận hành; dạy đúng học liệu thực tế: cảnh và hành động ở bãi biển.",
    objectives: ["Nhận biết nhóm từ beach trong thư mục Unit 10.", "Mô tả hành động bằng present continuous."],
    communicationGoal: "Học viên hỏi–đáp người đang làm gì trong tranh bãi biển.",
    core: [["swim","bơi"],["sea","biển"],["sun","mặt trời"],["shells","vỏ sò"],["jellyfish","sứa"],["camera","máy ảnh"],["fish","cá / câu cá"],["walk","đi bộ"],["paint","vẽ"],["jump","nhảy"]],
    supporting: [], exposure: [],
    language: {
      WORD: "swim", CHUNK: "I am swimming", SENTENCE: "I am swimming.", EXPANDED_SENTENCE: "She is walking on the beach.",
      QA: "What are you doing? → I am swimming.", PERSONAL: "I am taking a photo.",
      COMMUNICATION: "What is she doing? → She is walking on the beach.\nWhat about you?",
    },
    coreProduction: ["I am _____.", "He is _____.", "She is _____."],
    expandedProduction: ["She is walking on the beach.", "I am taking a photo."],
    grammar: ["Present continuous", "AM / IS / ARE", "V-ing spelling"],
    skills: ["Listening: nhận diện hành động", "Speaking: mô tả tranh"],
    recycle: ["Unit 8–9 action verbs"], story: "Một buổi ở bãi biển.", songs: ["The Beach Song"],
    tpr: ["Swim.", "Jump.", "Take a photo."], classroomEnglish: ["What are you doing?"], phonics: ["sh", "th"],
    sources: [["Homework L1","https://www.youtube.com/watch?v=_0pwAH5ijNI&t=214s"],["Homework L2","https://www.youtube.com/watch?v=A6U5sHB45rY&t=574s"]],
    sourceNotes: ["Tên thư mục YOUR DAY không khớp nội dung. Không tự thêm daily routines ngoài nguồn."],
  },
  {
    title: "UNIT 11 IN THE STREET", topic: "Transport and plural nouns", courseNumber: 2, lessonCount: 2,
    overview: "Gọi tên phương tiện và vận dụng số nhiều, gồm dạng bất quy tắc.",
    objectives: ["Gọi tên phương tiện.", "Phân biệt số ít/số nhiều."],
    communicationGoal: "Học viên nói There are two buses in the street.",
    core: [["helicopter","trực thăng"],["plane","máy bay"],["motorbike","xe máy"],["bike","xe đạp"],["car","ô tô"],["lorry","xe tải"],["bus","xe buýt"],["train","tàu"],["ship","tàu thủy"],["person / people","người"],["man / men","đàn ông"],["woman / women","phụ nữ"]],
    supporting: [["child / children","trẻ em"],["foot / feet","bàn chân"],["mouse / mice","chuột"],["sheep / sheep","cừu"]],
    exposure: ["bus → buses", "baby → babies", "box → boxes"],
    language: {
      WORD: "bus", CHUNK: "two buses", SENTENCE: "There is a bus.", EXPANDED_SENTENCE: "There are two buses in the street.",
      QA: "How many buses are there? → There are two buses.", PERSONAL: "I can see a train.",
      COMMUNICATION: "How many people are there? → There are three people.\nWhat about you?",
    },
    coreProduction: ["There is a _____.", "There are _____.", "I can see a _____."],
    expandedProduction: ["There are three children in the street.", "I can see two buses."],
    grammar: ["Plural nouns", "There is / There are"],
    skills: ["Listening: transport and numbers", "Speaking: street picture"],
    recycle: ["Numbers", "There is / There are"], story: "Đi từ nhà ra phố.", songs: ["The Wheels on the Bus"],
    tpr: ["Stop.", "Go.", "Get on the bus."], classroomEnglish: ["How many …?", "Over there."], phonics: ["ng", "ai"],
    sources: [["Transport","https://yourhomework.net/vocab/638612310"],["Irregular plurals","https://yourhomework.net/vocab/480500557"]],
  },
  {
    title: "UNIT 12 MY GRANDPARENTS", topic: "Family and cumulative revision", courseNumber: 2, lessonCount: 3,
    overview: "Ôn sâu gia đình và tái sử dụng Clothes, Food, Things in the house.",
    objectives: ["Ôn ông bà và quan hệ họ hàng.", "Ôn tích lũy Clothes, Food, house.", "Dùng sở hữu và have/has got."],
    communicationGoal: "Học viên giới thiệu ông bà, tuổi và đồ vật trong family showcase.",
    core: [["family","gia đình"],["grandfather / grandpa","ông"],["grandmother / grandma","bà"],["grandparents","ông bà"],["uncle","chú"],["aunt","cô"],["cousin","anh/chị họ"],["parents","bố mẹ"],["brother","anh/em trai"],["sister","chị/em gái"]],
    supporting: [["This is my grandfather's hat.","Đây là mũ của ông."],["How old is he/she?","Ông/bà bao nhiêu tuổi?"]],
    exposure: ["Clothes bank", "Food bank", "Things in the house bank"],
    language: {
      WORD: "grandpa", CHUNK: "my grandpa", SENTENCE: "He is my grandpa.", EXPANDED_SENTENCE: "This is my grandfather's hat.",
      QA: "Who is he? → He is my grandpa.", PERSONAL: "These are my grandparents.",
      COMMUNICATION: "How old is he? → He is sixty.\nWhat about you?",
    },
    coreProduction: ["He is my _____.", "This is _____'s _____.", "He is … years old."],
    expandedProduction: ["These are my grandparents.", "This is my grandfather's hat."],
    grammar: ["Possessive 's", "Have got / Has got", "How old"],
    skills: ["Speaking: family showcase", "Listening: age and possessions"],
    recycle: ["Family", "Clothes", "Food", "Things in the house"], story: "Thăm ông bà.", songs: ["This Is My Family"],
    tpr: ["Point to grandpa.", "Give grandma a hug."], classroomEnglish: ["How old is he?", "Whose hat is this?"], phonics: ["ee", "or"],
    sources: [["Family","https://yourhomework.net/vocab/271436109"],["Clothes","https://yourhomework.net/vocab/078796272"]],
    sourceNotes: ["Ngân hàng Exposure lớn: dùng ôn lựa chọn, không nhồi trong một buổi."],
  },
  {
    title: "UNIT 13 GOING TO THE ZOO", topic: "Jungle animals and have/has", courseNumber: 2, lessonCount: 2,
    overview: "Mở rộng động vật hoang dã và dùng have/has (got) đủ dạng.",
    objectives: ["Mở rộng từ vựng động vật hoang dã.", "Dùng have/has got ở khẳng định, phủ định, nghi vấn."],
    communicationGoal: "Học viên đóng vai zoo guide, mô tả con vật.",
    core: [["lion","sư tử"],["tiger","hổ"],["elephant","voi"],["monkey","khỉ"],["bear","gấu"],["panda","gấu trúc"],["fox","cáo"],["zebra","ngựa vằn"],["giraffe","hươu cao cổ"],["hippo","hà mã"],["rhino","tê giác"],["crocodile","cá sấu"]],
    supporting: [["snake","rắn"],["turtle","rùa"],["parrot","vẹt"],["kangaroo","chuột túi"],["camel","lạc đà"]],
    exposure: [],
    language: {
      WORD: "lion", CHUNK: "a big lion", SENTENCE: "It's a lion.", EXPANDED_SENTENCE: "The lion has a long tail.",
      QA: "Has it got a tail? → Yes, it has.", PERSONAL: "I like lions.",
      COMMUNICATION: "What has it got? → It has got big ears.\nWhat about you?",
    },
    coreProduction: ["It has _____.", "They have _____.", "Has it got _____?"],
    expandedProduction: ["The lion has a long tail.", "They have got big ears."],
    grammar: ["Have / Has", "Have got / Has got"],
    skills: ["Speaking: zoo guide", "Listening: animal features"],
    recycle: ["Unit 1 animals", "Body parts", "Can / Can't"], story: "Zoo guide kể về chuồng thú.", songs: ["Walking in the Jungle"],
    tpr: ["Roar like a lion.", "Swing like a monkey."], classroomEnglish: ["What has it got?"], phonics: ["oa", "ie"],
    sources: [["Jungle animals","https://yourhomework.net/vocab/881111435"],["Homework L1","https://www.youtube.com/watch?v=z3CzwF_eLbw"]],
  },
  {
    title: "UNIT 14 HAPPY BIRTHDAY!", topic: "Gifts, sweets and position", courseNumber: 2, lessonCount: 2,
    overview: "Nói về quà sinh nhật, bánh kẹo và vị trí đồ vật.",
    objectives: ["Gọi tên quà và bánh kẹo.", "Hỏi vị trí bằng nhóm giới từ."],
    communicationGoal: "Học viên mô tả bàn tiệc và chỉ dẫn đặt/tìm quà.",
    core: [["gift / present","quà"],["toy","đồ chơi"],["doll","búp bê"],["teddy bear","gấu bông"],["robot","rô-bốt"],["ball","bóng"],["kite","diều"],["balloon","bóng bay"],["card","thiệp"],["box","hộp"],["cake","bánh"],["party","tiệc"]],
    supporting: [["candy / sweets","kẹo"],["chocolate","sô-cô-la"],["lollipop","kẹo mút"],["behind","phía sau"],["between","ở giữa"],["in front of","phía trước"]],
    exposure: ["at home / school / zoo", "on the bus", "in the car"],
    language: {
      WORD: "gift", CHUNK: "a gift", SENTENCE: "It's a gift.", EXPANDED_SENTENCE: "The gift is under the box.",
      QA: "Where is the gift? → It's under the box.", PERSONAL: "I'd like a teddy bear.",
      COMMUNICATION: "What would you like? → I'd like a balloon.\nWhat about you?",
    },
    coreProduction: ["It's _____.", "Put it _____.", "I'd like _____."],
    expandedProduction: ["The gift is under the box.", "The balloon is next to the cake."],
    grammar: ["Prepositions of place", "Where questions"],
    skills: ["Listening: place/move objects", "Speaking: treasure hunt"],
    recycle: ["Toys", "Food", "Colours"], story: "Tiệc sinh nhật: tìm quà.", songs: ["Happy Birthday"],
    tpr: ["Give a gift.", "Put it under the box.", "Clap."], classroomEnglish: ["Where is it?", "Put it …"], phonics: ["oo", "ar"],
    sources: [["Gifts","https://yourhomework.net/vocab/022050660"],["Homework L2","https://www.youtube.com/watch?v=xrNEKIFkZY8"]],
  },
  {
    title: "UNIT 15 AT THE BEACH", topic: "Beach activities and preferences", courseNumber: 2, lessonCount: 1,
    overview: "Một buổi compact: mô tả bãi biển và like/likes + V-ing, rồi vào quỹ luyện đề.",
    objectives: ["Nhận biết cảnh và hành động ở bãi biển.", "Nói sở thích với like/likes + V-ing."],
    communicationGoal: "Học viên mô tả beach scene và nói hoạt động mình thích.",
    core: [["sea","biển"],["sun","mặt trời"],["shells","vỏ sò"],["swim / swimming","bơi"],["take a photo","chụp ảnh"],["walk","đi bộ"],["play","chơi"],["like","thích"]],
    supporting: [["jellyfish","sứa"],["camera","máy ảnh"],["paint","vẽ"],["jump","nhảy"]],
    exposure: [],
    language: {
      WORD: "sea", CHUNK: "in the sea", SENTENCE: "I like swimming.", EXPANDED_SENTENCE: "I like swimming in the sea.",
      QA: "What are you doing? → I am swimming.", PERSONAL: "I like swimming.",
      COMMUNICATION: "What do you like doing? → I like swimming.\nWhat about you?",
    },
    coreProduction: ["I am _____.", "I like _____.", "She likes _____."],
    expandedProduction: ["I like swimming.", "She is taking a photo."],
    grammar: ["Present continuous", "Like / Likes + V-ing"],
    skills: ["Speaking: beach scene", "Listening: nối tranh", "Transfer sang luyện đề"],
    recycle: ["Unit 8–10 actions", "Sports", "Colours"], story: "Kể lại một ngày ở biển.", songs: ["The Beach Song"],
    tpr: ["Swim.", "Take a photo.", "Jump."], classroomEnglish: ["What do you like doing?"], phonics: ["review"],
    sources: [["Homework L1","https://www.youtube.com/watch?v=My9B8oZiXyw"]],
  },
];

const grammarBank = ["A / AN", "Plural nouns", "Pronouns", "AM / IS / ARE", "THERE IS / THERE ARE", "THIS / THAT / THESE / THOSE", "Possessive", "CAN / CAN'T", "HAVE / HAS", "Present continuous", "Prepositions", "Question words", "SOME / ANY", "LIKE / LIKES", "Present simple"];
const vocabularyGroups = ["Family", "School", "Body", "Clothes", "Animals", "Food and drink", "House", "Toys", "Places", "Weather", "Colours", "Numbers 1–20", "Days of the week"];
const cambridgeSkills = ["Listening 1: nối tên", "Listening 2: viết tên/số", "Listening 3: chọn tranh", "Listening 4: tô màu", "Reading & Writing 1–5", "Speaking 1–5"];
const commonErrors = ["Nhầm 13/30, 14/40", "Sai spelling", "Chọn thông tin đầu dù người nói sửa", "Không quan sát tranh trước khi nghe", "Nhầm giới từ / he-she", "Trả lời một từ thay vì câu đủ"];

const reviewTitles = [
  "Reuse · Listening — nối tên",
  "Reuse · Listening — tên và số",
  "Reuse · Listening — chọn tranh",
  "Reuse · Listening — tô màu",
  "Reuse · Reading & Writing — Yes/No",
  "Reuse · Reading & Writing — chọn từ",
  "Reuse · Reading & Writing — nhìn tranh viết từ",
  "Reuse · Reading & Writing — hoàn thành câu",
  "Reuse · Speaking — tên, chỉ tranh, di chuyển vật",
  "Reuse · Speaking — tranh và sở thích",
];

function cards(unitNo: number, items: Pair[], tier: VocabularyTier): VocabCard[] {
  return items.map(([front, back], index) => ({
    id: `starter48-u${String(unitNo).padStart(2, "0")}-${tier.toLowerCase()}-${index + 1}`,
    front, back, tier, image: flashcardImageUrl(front) || undefined,
  }));
}

function activityItems(unitNo: number, source: Pair[], count?: number): ActivityItem[] {
  const pool = source.length >= 3 ? source : [["listen", "nghe"], ["speak", "nói"], ["read", "đọc"]] as Pair[];
  const take = count ?? pool.length;
  return pool.slice(0, Math.min(take, pool.length)).map(([prompt, answer], index) => ({
    id: `u${unitNo}-item-${index + 1}`, prompt, answer, image: flashcardImageUrl(prompt) || undefined,
    options: [answer, pool[(index + 1) % pool.length]![1], pool[(index + 2) % pool.length]![1]].filter((value, optionIndex, values) => values.indexOf(value) === optionIndex),
  }));
}

function makeActivity(id: string, lessonId: string, order: number, engineType: ActivityEngineType, title: string, instruction: string, items: ActivityItem[], reward: number, passingScore: number): GameActivity {
  const stamp = "2026-09-04T00:00:00.000Z";
  const modes: Record<ActivityEngineType, string> = { flashcard: "flip", audio_choice: "single", matching: "pairs", drag_drop: "answer_bank", sentence_builder: "tokens", reveal: "cards", phonics: "sound_choice", interactive_video: "checkpoint", song: "listen_read", speaking: "record", reader: "pages", quiz: "single_choice" };
  return { id, lessonId, engineType, mode: modes[engineType], title, instruction, status: "PUBLISHED", passingScore, starsReward: reward, sortOrder: order, config: { prompt: instruction, content: "", mediaUrl: "", items }, createdAt: stamp, updatedAt: stamp };
}

function arcFor(lessonCount: number, unitLesson: number): { phase: LearningPhase; response: number; label: string } {
  if (lessonCount === 1) return { phase: "REUSE_TRANSFER", response: 5, label: "Recycle & Transfer" };
  if (lessonCount === 2) return unitLesson === 1
    ? { phase: "INPUT_RESPONSE", response: 3, label: "Input & Guided Speaking" }
    : { phase: "REUSE_TRANSFER", response: 5, label: "Reuse & Check" };
  if (unitLesson === 1) return { phase: "INPUT_RESPONSE", response: 2, label: "Input & Response" };
  if (unitLesson === 2) return { phase: "GUIDED_SPEAKING", response: 4, label: "Guided Speaking" };
  return { phase: "REUSE_TRANSFER", response: 5, label: "Reuse & Transfer" };
}

function wordList(items: Pair[], count?: number) {
  return (count ? items.slice(0, count) : items).map(([front]) => front).join(", ");
}

function youtubeOf(unit: StarterUnitSource, index = 0) {
  const videos = unit.sources.filter(([, url]) => /youtube\.com|youtu\.be/i.test(url)).map(([, url]) => url);
  return videos[index] || videos[0] || "";
}

function speakingPlan(unit: StarterUnitSource) {
  const word = unit.language.WORD;
  const chunk = unit.language.CHUNK;
  const sentence = unit.language.SENTENCE;
  const qa = unit.language.QA.replace(/\s*\n\s*/g, " ");
  return [
    `L1: Point to ${word}.`,
    `L2: Show me ${word}. / Touch the ${chunk}.`,
    `L3: ${word} → ${chunk} → ${sentence}`,
    `L4: ${qa}`,
    `L5: ${unit.language.PERSONAL} / ${unit.language.EXPANDED_SENTENCE}`,
  ].join("\n");
}

function langLines(vocab: string, grammar: string) {
  return `Từ vựng: ${vocab || "—"}\nNgữ pháp: ${grammar || "—"}`;
}

function recycleLang(item: string) {
  const key = item.toLowerCase();
  if (key.includes("colour") || key.includes("color")) return { vocab: "red, blue, green, yellow, orange, pink, purple, black, white, brown, grey", grammar: "What colour is it?" };
  if (key.includes("number")) return { vocab: "one–twenty", grammar: "How many …?" };
  if (key.includes("animal")) return { vocab: "frog, duck, tiger, elephant", grammar: "It's a ____." };
  if (key.includes("big") || key.includes("little")) return { vocab: "big, little", grammar: "It's a big / little ____." };
  if (key.includes("name")) return { vocab: "names", grammar: "What's your name? I'm ____." };
  if (key.includes("boy") || key.includes("girl")) return { vocab: "boy, girl", grammar: "He is a boy. She is a girl." };
  if (key.includes("i like")) return { vocab: "", grammar: "I like ____." };
  if (key.includes("family")) return { vocab: "mum, dad, brother, sister", grammar: "This is my ____." };
  if (key.includes("he / she")) return { vocab: "he, she", grammar: "He is … / She is …" };
  if (key.includes("clothes")) return { vocab: "T-shirt, trousers, shoes, hat", grammar: "I'm wearing ____." };
  if (key.includes("body")) return { vocab: "head, arms, legs, hands, feet", grammar: "Point to your ____." };
  if (key.includes("home object") || key.includes("things in the house")) return { vocab: "table, chair, door, window, lamp", grammar: "It's on / in / under the ____." };
  if (key.includes("food")) return { vocab: "bread, cake, juice, apple", grammar: "I like ____." };
  if (key.includes("can")) return { vocab: "run, jump, swim, fly", grammar: "I can / I can't ____." };
  if (key.includes("there is")) return { vocab: "", grammar: "There is / There are" };
  if (key.includes("action") || key.includes("sport")) return { vocab: item, grammar: "I can ____." };
  if (key.includes("toy")) return { vocab: "ball, doll, robot, car", grammar: "I like this ____." };
  return { vocab: item, grammar: "" };
}

function planNew(unit: StarterUnitSource, unitLesson: number, extra: { exam?: boolean; title: string }) {
  if (extra.exam) return langLines("không thêm từ mới", "theo dạng đề buổi");
  if (unitLesson === 1) return langLines(wordList(unit.core), [...unit.grammar.slice(0, 2), ...unit.coreProduction.slice(0, 2)].join(" · "));
  if (unitLesson === 2) return langLines(wordList(unit.supporting), [...unit.grammar, unit.language.SENTENCE, unit.language.EXPANDED_SENTENCE].join(" · "));
  return langLines(`${wordList(unit.core)}; ${wordList(unit.supporting)}`, unit.expandedProduction.join(" · "));
}

function planRecycle(unit: StarterUnitSource, extra: { exam?: boolean }) {
  if (extra.exam) return langLines("ngôn ngữ STARTERS đã học", "theo dạng đề buổi");
  const parts = unit.recycle.map(recycleLang);
  return langLines(
    parts.map((item) => item.vocab).filter(Boolean).join("; ") || unit.recycle.join(", "),
    [...new Set(parts.map((item) => item.grammar).filter(Boolean))].join(" · "),
  );
}

function planReuse(unit: StarterUnitSource, unitLesson: number, extra: { exam?: boolean; title: string }, classTitle?: string) {
  if (extra.exam) return langLines("từ vựng đã học", extra.title);
  if (classTitle) {
    const recognize = /recognize/i.test(extra.title);
    return recognize
      ? langLines(wordList(unit.core, 6), unit.coreProduction.slice(0, 2).join(" · "))
      : langLines(wordList(unit.core), [...unit.coreProduction, unit.language.PERSONAL].join(" · "));
  }
  if (unitLesson === 1) return langLines(wordList(unit.core), unit.coreProduction.slice(0, 2).join(" · "));
  if (unitLesson === 2) return langLines(`${wordList(unit.core, 6)}; ${wordList(unit.supporting)}`, [...unit.coreProduction, ...unit.expandedProduction].join(" · "));
  return langLines(`${wordList(unit.core)}; ${wordList(unit.supporting)}`, unit.expandedProduction.join(" · "));
}

function lessonFor(unit: StarterUnitSource, unitNo: number, day: CourseDay, unitLesson: number, extra: { testSkills?: TestSkill[]; exam?: boolean; title: string }): SyllabusLesson {
  const core = cards(unitNo, unit.core, "CORE");
  const supporting = cards(unitNo, unit.supporting, "SUPPORTING");
  const exposure = unit.exposure.map((front, index) => ({ id: `starter48-u${String(unitNo).padStart(2, "0")}-ex-${index + 1}`, front, back: "Exposure — hiểu khi có story/song/teacher talk", tier: "EXPOSURE" as const }));
  const vocabulary = extra.exam ? [] : unitLesson === 1 ? core : [...core, ...supporting, ...exposure];
  const production = extra.exam ? ["Trả lời đúng loại câu hỏi Cambridge.", "Nói câu đủ sức, không chỉ một từ."] : unitLesson === 1 ? unit.coreProduction.slice(0, 2) : [...unit.coreProduction, ...unit.expandedProduction];
  const testNote = extra.testSkills?.length ? `Cửa sổ test 90 phút: chỉ làm ${extra.testSkills.join(" + ")}. Kỹ năng còn lại để buổi sau. Đổi thứ tự nếu sĩ số lớn.` : "";
  return {
    id: `${day.id}-lesson`, unitId: day.unitId, courseDayId: day.id, lessonNumber: 1, lessonType: extra.exam ? "EXAM" : extra.testSkills?.length ? "ASSESSMENT" : day.phase || "CLASS",
    name: extra.title, order: 1,
    pupilBookPage: "Curriculum CORE — học liệu STARTERS của trung tâm",
    activityBookPage: extra.exam ? "Cambridge Starters practice" : "Portal STEPS — Home App 10–20 phút",
    hasListening: true, hasSpeaking: !extra.exam || extra.testSkills?.includes("SPEAKING") || extra.title.includes("Speaking"),
    hasReading: extra.exam || extra.testSkills?.includes("READING_WRITING") || unitLesson >= 2,
    hasWriting: extra.exam || extra.testSkills?.includes("READING_WRITING") || unitLesson >= 2,
    tasks: extra.exam
      ? ["Warm-up retrieval", extra.title, "Immediate feedback", "Không nhồi 4 kỹ năng trong 90 phút"]
      : extra.testSkills?.length
        ? [unit.communicationGoal, testNote, "Home App nhẹ sau buổi"]
        : unit.courseNumber === 2
          ? ["Meaning before explanation", extra.title, "10–15 phút mini đề 1 kỹ năng", "Home App 10–20 phút"]
          : ["Meaning before explanation", extra.title, "TPR / story / song", "Production có trọng tâm"],
    languageTargets: production,
    lessonOutcomes: extra.exam ? ["Hoàn thành đúng dạng đề của buổi; chưa cần làm đủ 4 kỹ năng."] : extra.testSkills?.length ? [unit.communicationGoal, "Bắt đầu / tiếp tục cửa sổ test 4 kỹ năng."] : [unit.communicationGoal],
    lessonPlan: [
      `NEW: ${planNew(unit, unitLesson, extra)}`,
      `RECYCLE: ${planRecycle(unit, extra)}`,
      `REUSE: ${planReuse(unit, unitLesson, extra)}`,
      `PHONICS: ${unit.phonics.join(" · ")}. Hỗ trợ literacy, không thay Natural English.`,
      `Listening: ${extra.testSkills?.includes("LISTENING") || extra.title.includes("Listening") ? "Dạng Cambridge của buổi. Quan sát tranh trước khi nghe." : unit.skills.find((item) => item.startsWith("Listening")) || "Nghe và phản hồi"}`,
      `Speaking: ${speakingPlan(unit)}`,
      `Reading: ${extra.testSkills?.includes("READING_WRITING") || extra.title.includes("Reading") ? "Dạng Cambridge Reading & Writing." : unit.skills.find((item) => item.startsWith("Reading")) || "Đọc từ/câu theo tranh"}`,
      `Writing: ${extra.exam || extra.testSkills?.includes("READING_WRITING") ? "Một từ / câu ngắn theo dạng Starters." : "Trace/copy có chọn lọc."}`,
      `Song / Chant: ${extra.exam ? "Không. Resource không quyết định buổi test." : `${unit.songs[0] || "Chant Core words"} | ${youtubeOf(unit, 1) || youtubeOf(unit)}`}`,
      `Audio: Nguồn đã đối chiếu hoặc giọng giáo viên. | ${youtubeOf(unit)}`,
      `Interactive Video: ${extra.exam ? "Không dùng video làm đầu ra." : `${unit.story} | ${youtubeOf(unit)}`}`,
    ],
    vocabulary, grammar: extra.exam ? grammarBank : unit.grammar,
    homework: "Hai buổi Online 15–20 phút sau lớp: Recognize rồi Respond trên Portal. Không giao worksheet dài.",
    materials: extra.exam ? [] : unit.sources.map(([title, url]) => ({ title, url })),
    durationMinutes: 90,
    teacherSupport: extra.exam ? "LOW" : unitLesson === 1 ? "HIGH" : "MEDIUM",
    teacherInput: extra.exam ? "LOW" : unitLesson === 1 ? "HIGH" : "MEDIUM",
    studentProduction: extra.exam || unitLesson > 1 ? "HIGH" : "LOW",
    components: ["CLASS", day.phase || "", `Response Level ${day.responseLevel}`, ...(extra.testSkills || [])],
    assessmentCriteria: extra.exam || extra.testSkills?.length ? ["Listening", "Response", "Speaking", "Communication", "Literacy", "Confidence"] : ["Meaning", "Response", "Language Use", "Communication"],
    homeLearningType: "LIGHT_FOLLOW_UP",
  };
}

function shortUnitName(unit: StarterUnitSource) {
  return unit.title.replace(/^UNIT \d+\s+/, "");
}

function onlineLessonFor(unit: StarterUnitSource, unitNo: number, day: CourseDay, slot: 1 | 2, classTitle: string): SyllabusLesson {
  const recognize = slot === 1;
  const core = cards(unitNo, unit.core.slice(0, 6), "CORE");
  const supporting = cards(unitNo, unit.supporting.slice(0, 4), "SUPPORTING");
  const focus = recognize ? "Recognize" : "Respond";
  return {
    id: `${day.id}-lesson`, unitId: day.unitId, courseDayId: day.id, lessonNumber: 1, lessonType: "HOME",
    name: day.title, order: 1,
    pupilBookPage: "Curriculum CORE — học liệu STARTERS của trung tâm",
    activityBookPage: "Portal STEPS — tự học 15–20 phút",
    hasListening: true, hasSpeaking: !recognize, hasReading: !recognize, hasWriting: false,
    tasks: recognize
      ? ["Nghe và nhìn lại từ vừa học trên lớp", "Nhận diện tranh / từ / âm", "Lặp lại mẫu câu ngắn, chưa cần nói dài"]
      : ["Dùng lại từ vừa nhận diện", "Trả lời câu hỏi ngắn bằng câu đủ sức", "Nói một câu về bản thân từ ngôn ngữ buổi Offline"],
    languageTargets: recognize ? unit.coreProduction.slice(0, 2) : [...unit.coreProduction, ...unit.expandedProduction.slice(0, 1)],
    lessonOutcomes: recognize
      ? [`Nhận diện lại Core của ${shortUnitName(unit)}.`, "Nghe–nhìn–lặp, không thêm ngôn ngữ mới."]
      : [unit.communicationGoal, "Tái sử dụng ngôn ngữ buổi Offline trên Portal."],
    lessonPlan: [
      `NEW: Không thêm từ mới. Chỉ ôn lại buổi Offline “${classTitle}”: ${wordList(unit.core, 6)}. Nếu quên, nghe–nhìn lại, không introduce Supporting.`,
      `RECYCLE: ${planRecycle(unit, {})}`,
      `REUSE: ${planReuse(unit, recognize ? 1 : 2, { title: day.title }, classTitle)}`,
      `PHONICS: ${unit.phonics.join(" · ")}. Nghe âm, không giảng quy tắc.`,
      `Listening: ${recognize ? "Nghe từ/câu ngắn và chọn tranh." : unit.skills.find((item) => item.startsWith("Listening")) || "Nghe và phản hồi"}`,
      `Speaking: ${speakingPlan(unit)}`,
      `Reading: ${recognize ? "Ghép từ–tranh." : unit.skills.find((item) => item.startsWith("Reading")) || "Đọc từ/câu theo tranh"}`,
      `Writing: ${recognize ? "Không viết ít. Chỉ nhìn và chọn." : "Một từ / câu ngắn nếu cần."}`,
      `Song / Chant: ${unit.songs[0] || "Chant Core words"} | ${youtubeOf(unit, 1) || youtubeOf(unit)}`,
      `Audio: Nguồn đã đối chiếu hoặc giọng trên Portal. | ${youtubeOf(unit)}`,
      `Interactive Video: ${unit.story} | ${youtubeOf(unit)}`,
    ],
    vocabulary: recognize ? core : [...core, ...supporting],
    grammar: unit.grammar,
    homework: "",
    materials: unit.sources.map(([title, url]) => ({ title, url })),
    durationMinutes: 20,
    teacherSupport: "LOW", teacherInput: "LOW", studentProduction: recognize ? "LOW" : "MEDIUM",
    components: ["HOME", "ONLINE", focus, day.phase || ""],
    assessmentCriteria: ["Meaning", "Response", "Language Use"],
    homeLearningType: "LIGHT_FOLLOW_UP",
  };
}

function dayGames(lessonId: string, dayNo: number, unitNo: number, source: Pair[], kind: "class" | "recognize" | "respond"): GameActivity[] {
  const flash = kind === "recognize" || (kind === "class" && dayNo % 2 === 1);
  const items = activityItems(unitNo || 16, source, flash ? source.length : Math.min(4, source.length));
  if (kind === "class") {
    return [makeActivity(`starter144-d${dayNo}-game`, lessonId, 1, flash ? "flashcard" : "matching", "Ôn tập buổi Offline", "Chơi game nhận diện từ vừa học trên lớp. 5–10 phút.", items, 10, 60)];
  }
  if (kind === "recognize") {
    return [makeActivity(`starter144-d${dayNo}-game`, lessonId, 1, "flashcard", "Online · Recognize", "15–20 phút. Nghe, nhìn, lật thẻ, nhận diện. Không học từ mới.", items, 10, 60)];
  }
  return [makeActivity(`starter144-d${dayNo}-game`, lessonId, 1, "quiz", "Online · Respond", "15–20 phút. Chọn đáp án / nói lại câu đã học trên lớp.", items, 12, 70)];
}

export function buildStarterFortyEightCurriculum(existingMeta: SyllabusMeta): SyllabusDocument {
  const sections: CurriculumSection[] = [
    { id: "starter48-course-1", type: "COURSE", title: "KHOÁ 1", courseDayStart: 1, courseDayEnd: 72, sortOrder: 1, unitId: null, courseNumber: 1 },
    { id: "starter48-course-2", type: "COURSE", title: "KHOÁ 2", courseDayStart: 73, courseDayEnd: 144, sortOrder: 2, unitId: null, courseNumber: 2 },
  ];
  const syllabusUnits: SyllabusUnit[] = [];
  const days: CourseDay[] = [];
  const lessons: SyllabusLesson[] = [];
  const resources: LessonResource[] = [];
  const activities: GameActivity[] = [];
  let global = 1;
  const classCount: Record<1 | 2, number> = { 1: 0, 2: 0 };

  function pushOfflineWithOnline(input: {
    unit: StarterUnitSource; unitNo: number; unitId: string | null; sectionId: string;
    unitLesson: number; unitDayNumber: number; title: string; phase: LearningPhase; response: number;
    gameSource: Pair[];
  }) {
    const { unit, unitNo, unitId, sectionId, unitLesson, title, phase, response, gameSource } = input;
    const courseNumber = unit.courseNumber;
    classCount[courseNumber] += 1;
    const classNo = classCount[courseNumber];
    const vocab = gameSource.length ? gameSource : [...unit.core, ...unit.supporting];

    const offlineId = `starter144-d${String(global).padStart(3, "0")}`;
    const offline: CourseDay = {
      id: offlineId, sectionId, unitId, courseDayNumber: global, unitDayNumber: input.unitDayNumber, title,
      weekNumber: Math.ceil(classNo / 2), courseNumber, track: "CLASS", classLessonNumber: classNo,
      deliveryMode: "OFFLINE", phase, responseLevel: response, assessmentType: null, durationMinutes: 90, sortOrder: global,
    };
    days.push(offline);
    const offlineLesson = lessonFor(unit, unitNo, offline, unitLesson, { title });
    lessons.push(offlineLesson);
    activities.push(...dayGames(offlineLesson.id, global, unitNo, vocab, "class"));
    global += 1;

    ([["Recognize", "recognize", "INPUT_RESPONSE", 3], ["Respond", "respond", "GUIDED_SPEAKING", 4]] as const).forEach(([label, kind, onlinePhase, onlineResponse], slot) => {
      const onlineTitle = `Online · ${label} · ${shortUnitName(unit)}`;
      const online: CourseDay = {
        id: `starter144-d${String(global).padStart(3, "0")}`, sectionId, unitId, courseDayNumber: global,
        unitDayNumber: input.unitDayNumber + slot + 1, title: onlineTitle,
        weekNumber: Math.ceil(classNo / 2), courseNumber, track: "HOME", classLessonNumber: undefined,
        deliveryMode: "ONLINE", phase: onlinePhase, responseLevel: onlineResponse, assessmentType: null, durationMinutes: 20, sortOrder: global,
      };
      days.push(online);
      const onlineLesson = onlineLessonFor(unit, unitNo, online, (slot + 1) as 1 | 2, title);
      lessons.push(onlineLesson);
      activities.push(...dayGames(onlineLesson.id, global, unitNo, vocab, kind));
      global += 1;
    });
  }

  function addUnit(unit: StarterUnitSource, unitNo: number) {
    const padded = String(unitNo).padStart(2, "0");
    const sectionId = `starter48-course-${unit.courseNumber}`;
    const unitId = `starter48-u${padded}`;
    syllabusUnits.push({
      id: unitId, sectionId, unitNumber: unitNo, name: unit.title, topic: unit.topic, overview: unit.overview, learningObjectives: unit.objectives,
      courseNumber: unit.courseNumber, lessonCount: unit.lessonCount, communicationGoal: unit.communicationGoal,
      coreVocabulary: unit.core.map(([a, b]) => `${a} — ${b}`), supportingVocabulary: unit.supporting.map(([a, b]) => `${a} — ${b}`), exposureVocabulary: unit.exposure,
      languageMap: encodeLanguageMap(unit.language), coreProduction: unit.coreProduction, expandedProduction: unit.expandedProduction,
      storyFocus: unit.story, storyVideoUrl: unit.sources.find(([, url]) => /youtube\.com|youtu\.be/i.test(url))?.[1] || "",
      songs: unit.songs, tprActions: unit.tpr, classroomEnglish: unit.classroomEnglish,
      phonicsFocus: unit.phonics, phonicsVideoUrl: "https://www.youtube.com/watch?v=y1r-T5QYAc4",
      flashcardFocus: "Flashcard", flashcardVideoUrl: unit.sources.find(([, url]) => /youtube\.com|youtu\.be/i.test(url))?.[1] || "https://www.youtube.com/watch?v=a2k9wJuAsr8",
      trickyWords: Object.values(unit.language).flatMap((line) => line.match(/\b(the|is|are|do|does|have|has|this|that)\b/gi) || []).filter((value, pos, array) => array.findIndex((item) => item.toLowerCase() === value.toLowerCase()) === pos),
      recycledLanguage: unit.recycle, skillFocus: unit.skills,
      teachingAids: [
        ...unit.core.map(([word]) => {
          const url = flashcardImageUrl(word);
          return url ? { title: `Hình · ${word.split("/")[0].trim()}`, url } : null;
        }).filter((item): item is { title: string; url: string } => Boolean(item)).slice(0, 4),
        ...unit.sources.filter(([, url]) => !/youtube\.com|youtu\.be/i.test(url)).map(([title, url]) => ({ title, url })),
      ],
      sourceNotes: unit.sourceNotes || [], order: unitNo,
    });
    for (let unitLesson = 1; unitLesson <= unit.lessonCount; unitLesson += 1) {
      const arc = arcFor(unit.lessonCount, unitLesson);
      pushOfflineWithOnline({
        unit, unitNo, unitId, sectionId, unitLesson, unitDayNumber: (unitLesson - 1) * 3 + 1,
        title: `${arc.label} · ${shortUnitName(unit)}`, phase: arc.phase, response: arc.response,
        gameSource: unitLesson === 1 ? [...unit.core] : [...unit.core, ...unit.supporting],
      });
    }
    unit.sources.forEach(([title, url], sourceIndex) => resources.push({
      id: `starter48-u${padded}-r${sourceIndex + 1}`, sectionId, unitId, courseDayId: null, lessonId: null,
      resourceType: url.includes("youtube.com") ? "VIDEO" : "EXTERNAL_LINK", title, url,
      description: "Resource = reinforcement. Curriculum là CORE.", sortOrder: resources.length + 1, isActive: true, openInNewTab: true,
    }));
  }

  units.filter((unit) => unit.courseNumber === 1).forEach((unit, index) => addUnit(unit, index + 1));

  pushOfflineWithOnline({
    unit: units[8]!, unitNo: 9, unitId: "starter48-u09", sectionId: "starter48-course-1",
    unitLesson: 3, unitDayNumber: 7, title: "Reuse & Transfer · MY HOBBIES",
    phase: "REUSE_TRANSFER", response: 5, gameSource: units[8]!.core,
  });

  units.filter((unit) => unit.courseNumber === 2).forEach((unit, index) => addUnit(unit, index + 10));

  reviewTitles.forEach((title, index) => {
    pushOfflineWithOnline({
      unit: units[14]!, unitNo: 15, unitId: null, sectionId: "starter48-course-2",
      unitLesson: 1, unitDayNumber: index * 3 + 1, title,
      phase: "REUSE_TRANSFER", response: 5, gameSource: [["listen", "nghe"], ["read", "đọc"], ["speak", "nói"], ["write", "viết"]],
    });
  });

  [
    "Reuse & Transfer · 15 Unit",
    "Communication · personal language",
  ].forEach((title, index) => {
    pushOfflineWithOnline({
      unit: units[14]!, unitNo: 15, unitId: null, sectionId: "starter48-course-2",
      unitLesson: 1, unitDayNumber: (10 + index) * 3 + 1, title,
      phase: "REUSE_TRANSFER", response: 5, gameSource: units[14]!.core,
    });
  });

  days.sort((a, b) => a.courseDayNumber - b.courseDayNumber);
  const meta: SyllabusMeta = {
    ...existingMeta,
    code: existingMeta.code || "STARTER",
    name: existingMeta.name || "STARTER — 48 Offline · 96 Online · 2 khóa",
    level: existingMeta.level || "Pre-A1 Starters",
    description: existingMeta.description || "15 Unit Started.md · 2 khóa · 48 Offline × 90 phút · mỗi buổi Offline kèm 2 buổi Online tự học 15–20 phút · game ôn trên Portal mỗi ngày.",
    status: "ACTIVE",
    totalCourseDays: 144,
    updatedAt: new Date().toISOString(),
  };

  return {
    meta,
    program: {
      version: "STARTER-144-V9",
      durationMonths: 6,
      totalWeeks: 24,
      sessionsPerWeek: 6,
      offlineSessionsPerWeek: 2,
      onlineSessionsPerWeek: 4,
      classDurationMinutes: 90,
      coursesCount: 2,
      classLessonsPerCourse: 24,
      unitsCount: 15,
      unitWeeks: 0,
      wrapWeeks: 0,
      lightHome: true,
      learningCycle: ["Listen", "Understand", "Respond", "Speak", "Reuse", "Transfer"],
      responseLevels: ["Level 1 — Recognize", "Level 2 — Respond", "Level 3 — Repeat", "Level 4 — Respond with language", "Level 5 — Produce"],
      languageProgression: ["Word", "Chunk", "Sentence", "Q&A", "Personal language", "Communication"],
      recyclingCycle: ["Exposure", "Recognition", "Guided Use", "Independent Use", "Transfer"],
      assessmentDimensions: ["Listening", "Response", "Speaking", "Communication", "Literacy", "Confidence"],
      grammarBank, requiredVocabularyGroups: vocabularyGroups, cambridgeSkills, commonErrors,
      sourceScope: ["Khung 48 Offline do trung tâm chốt", "Mỗi Offline + 2 Online tự học theo Proposal STEPS", "Started.md — 15 Unit vận hành"],
      coreStatement: "Không học thật nhiều — mà dùng được thật nhiều.",
      courses: [
        { number: 1, title: "KHOÁ 1", dayStart: 1, dayEnd: 72, units: units.filter((item) => item.courseNumber === 1).map((item) => item.title), focus: "Unit 1–9 · mỗi Offline + 2 Online Recognize / Respond" },
        { number: 2, title: "KHOÁ 2", dayStart: 73, dayEnd: 144, units: units.filter((item) => item.courseNumber === 2).map((item) => item.title), focus: "Unit 10–15 · rồi ôn xoắn, mỗi buổi Offline vẫn kèm 2 Online" },
      ],
    },
    sections, units: syllabusUnits, days, lessons, resources, exercises: [], activities,
  };
}

export function buildStarterFourMonthCurriculum(existingMeta: SyllabusMeta): SyllabusDocument {
  return buildStarterFortyEightCurriculum(existingMeta);
}

export function buildStepsThreeYearCurriculum(existingMeta: SyllabusMeta): SyllabusDocument {
  return buildStarterFortyEightCurriculum(existingMeta);
}
