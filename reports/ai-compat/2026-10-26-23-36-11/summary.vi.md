# Kết quả kiểm tra OpenAI compatibility

Thời gian: 26/10/2026, 23:36:11, Asia/Saigon. Endpoint: `http://localhost:3669/v1`. Model yêu cầu: `gpt-6-thinking`.

**Kết luận: dùng được cho chat văn bản cơ bản, nhưng chưa tương thích đầy đủ với OpenAI Chat Completions.** JSON envelope cơ bản và streaming thông thường hợp lệ. Một số request nâng cao được chấp nhận bằng HTTP 200 nhưng không thực hiện đúng yêu cầu.

Đã chạy 52 ca: **18 PASS, 29 FAIL, 3 BEHAVIOR_FAIL, 2 ERROR**. Thêm một request kiểm tra lại raw SSE cho `include_usage`. `BEHAVIOR_FAIL` là model không làm theo chỉ dẫn trong mẫu thử, không phải bằng chứng JSON HTTP bị hỏng hoặc gateway chắc chắn đã xóa role. `FAIL` bao gồm cả khác biệt HTTP status so với OpenAI; không phải mọi FAIL đều làm hỏng chat cơ bản. `ERROR` ở reasoning/vision là lỗi upstream HTTP 502, chưa đủ để xác định năng lực model.

## Bằng chứng đáng chú ý

| Nhóm | Quan sát thực tế |
|---|---|
| JSON envelope | Có `id`, `object: chat.completion`, `created`, `model`, `choices`, role assistant, finish reason và usage hợp lệ trong ca cơ bản. SDK `openai` đọc được. |
| Multi-turn và tiếng Việt | Các ca giữ ngữ cảnh và Unicode đạt. |
| Giới hạn token | Gửi `max_completion_tokens: 1` nhưng nhận **59 completion tokens**, `finish_reason: stop`; `max_tokens` cũ cũng không thực thi giới hạn trong ca thử. |
| Nhiều lựa chọn | `n: 2` vẫn chỉ trả một choice; streaming cũng chỉ có một choice. |
| JSON mode | Nội dung là `<escape>{"ok":true,"count":3}</escape>`, không phải chuỗi JSON parse trực tiếp được. Strict JSON Schema cũng không được đáp ứng. |
| Tool calling | Forced tool, required tool, legacy functions và streaming tool đều không trả structured tool call như yêu cầu. Không gọi dịch vụ thời tiết thật trong các test. |
| Stop | `stop: ["<END>"]` vẫn nhận nội dung chứa `<END>`, có thêm markup escape. |
| Logprobs | Request có `logprobs`/`top_logprobs` nhưng output không cung cấp dữ liệu tương ứng. |
| SSE usage | Không có usage chunk đúng yêu cầu `include_usage: true`. Kiểm tra lại raw SSE xác nhận thiếu usage. Frame lỗi bổ sung ở lượt đầu không lặp lại trong lượt kiểm tra lại. |
| Validation | Thiếu model, temperature ngoài giới hạn, `n: 0`, token limit âm và một số khai báo tool/format sai vẫn trả HTTP 200 thay vì lỗi validation. |
| Lỗi và routing | Model không tồn tại trả 502; GET Chat Completions và GET model metadata trả HTML HTTP 200. Một số status khác với OpenAI. |
| Authentication | Không gửi key hoặc gửi key sai đều bị từ chối bằng HTTP 401 và error object phù hợp. |
| System/developer | Các ca chỉ dẫn ưu tiên cao không đạt. Đây là quan sát hành vi trên các mẫu thử, cần điều tra gateway/model riêng nếu muốn xác định nguyên nhân. |
| Reasoning và vision | `reasoning_effort: low` và ảnh PNG tổng hợp trả lỗi upstream HTTP 502. Không dùng ảnh cá nhân. |
| Responses API | Một ca văn bản cơ bản `/responses` đạt. Chưa kiểm tra đầy đủ tính năng Responses. |

Các response ID được tái sử dụng giữa một số request có tham số khác nhau được lưu trong `results.json`; đây là quan sát response reuse, chưa xác định cách triển khai cache. Các ca temperature, top-p, penalties và seed chỉ xác nhận request được nhận, không chứng minh backend thực thi thuật toán tương ứng.

## Phạm vi và tái chạy

Đây là bộ kiểm thử thực dụng, không phải chứng nhận và không bao phủ mọi tổ hợp tham số hay toàn bộ OpenAI API. Chưa test audio, image generation/editing, embeddings, lưu/xóa completion, rate-limit stress, billing hoặc quota. Không thay đổi `.env` hay dữ liệu ứng dụng.

Chạy từ repository root:

```powershell
node --env-file=apps/api/.env scripts/check-ai-chat-compat.mjs
```

Lệnh gửi các prompt giả lập ngắn, tối đa hai request đồng thời; có thể phát sinh usage ở provider. Exit code 1 nghĩa là có FAIL, BEHAVIOR_FAIL hoặc ERROR. Kết quả đã loại API key và không ghi Authorization header.

- [Ma trận đủ 52 ca](report.md)
- [Request và response evidence](results.json)
- [Raw SSE kiểm tra lại usage](stream-usage-recheck.json)
- [OpenAI Chat Completions API reference](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)
