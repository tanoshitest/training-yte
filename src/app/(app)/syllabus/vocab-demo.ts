import type { VocabCard } from "./vocab";

/** 5 thẻ mẫu cho 4 buổi đầu (Giao tiếp — Đời sống hàng ngày). */
export const DEMO_VOCAB: Record<string, VocabCard[]> = {
  "Introducing yourself": [
    { front: "hello", back: "xin chào" },
    { front: "my name is", back: "tên tôi là" },
    { front: "nice to meet you", back: "rất vui được gặp bạn" },
    { front: "where are you from?", back: "bạn đến từ đâu?" },
    { front: "I am", back: "tôi là" },
  ],
  "Daily routine": [
    { front: "wake up", back: "thức dậy" },
    { front: "have breakfast", back: "ăn sáng" },
    { front: "go to work", back: "đi làm" },
    { front: "have lunch", back: "ăn trưa" },
    { front: "go to bed", back: "đi ngủ" },
  ],
  Shopping: [
    { front: "how much", back: "bao nhiêu tiền" },
    { front: "cheap", back: "rẻ" },
    { front: "expensive", back: "đắt" },
    { front: "size", back: "kích cỡ" },
    { front: "receipt", back: "hóa đơn" },
  ],
  "Ordering food": [
    { front: "menu", back: "thực đơn" },
    { front: "I'd like", back: "tôi muốn" },
    { front: "the bill", back: "tính tiền" },
    { front: "delicious", back: "ngon" },
    { front: "water", back: "nước" },
  ],
};
