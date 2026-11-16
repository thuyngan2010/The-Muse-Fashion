# AI compatibility report: gpt-6-thinking

Time: 2026-10-26 23:36:11 (Asia/Saigon)
Endpoint: http://localhost:3669/v1

Reference: [OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)

Scope: Chat Completions, SSE, function tools, validation/authentication, model discovery; one Responses API probe.

Not an OpenAI certification. No audio, image generation/editing, embeddings, uploads, stored-completion CRUD, rate-limit stress, billing, or exhaustive parameter-combination testing. Optional capability rejection is distinct from malformed output. Accepted sampler/reasoning parameters do not prove their implementation. BEHAVIOR_FAIL denotes observed prompt-following failures, not a malformed JSON response or proof that the gateway drops roles. FAIL includes strict HTTP-status differences from OpenAI as well as silently ignored feature settings.

Results: {"PASS":18,"FAIL":29,"BEHAVIOR_FAIL":3,"UNSUPPORTED":0,"ERROR":2}

| Case | Result | HTTP | Time | Findings |
|---|---|---:|---:|---|
| 01 basic JSON and response envelope | PASS | 200 | 7.8s |  |
| 02 multi-turn conversation | PASS | 200 | 8.0s |  |
| 03 system instruction priority | BEHAVIOR_FAIL | 200 | 7.0s | Expected "SYSTEM_OK", got "OK" |
| 04 developer role | BEHAVIOR_FAIL | 200 | 5.9s | Expected "DEV_OK", got "OK" |
| 05 array text content parts | PASS | 200 | 5.2s |  |
| 06 Vietnamese Unicode | PASS | 200 | 6.1s |  |
| 07 exact-text instruction with quotes/newlines | BEHAVIOR_FAIL | 200 | 7.6s | Expected "A \"quote\"\nB \\ slash", got "<text>A \"quote\"\nB \\ slash</text>" |
| 08 multiple choices n=2 | FAIL | 200 | 0.0s | n=2 did not return two distinct choices |
| 09 temperature=0 acceptance | PASS | 200 | 5.4s | Acceptance only; sampling semantics cannot be proven by one sample. |
| 10 top_p acceptance | PASS | 200 | 5.8s | Acceptance only; not a statistical sampler test. |
| 11 frequency and presence penalties | PASS | 200 | 5.1s | Acceptance only. |
| 12 max_completion_tokens=1 enforced | FAIL | 200 | 6.9s | truncated completion must finish with length; completion token cap was exceeded |
| 13 legacy max_tokens=1 enforced | FAIL | 200 | 6.6s | truncated completion must finish with length; completion token cap was exceeded |
| 14 stop sequence enforced | FAIL | 200 | 5.6s | Expected "ALPHA", got "ALPHA<escape><END></escape>BETA" |
| 15 JSON object output | FAIL | 200 | 7.1s | content is not a JSON object |
| 16 strict JSON schema against conflicting prompt | FAIL | 200 | 8.0s | strict schema ignored: output is not JSON |
| 17 forced named function tool | FAIL | 200 | 7.9s | no tool_calls returned |
| 18 required function tool | FAIL | 200 | 7.6s | no tool_calls returned |
| 19 tool_choice none | PASS | 200 | 5.2s |  |
| 20 function tool result round trip | FAIL | 200 | 4.7s | Expected "21", got "" |
| 21 parallel tool calls | FAIL | 200 | 10.5s | no tool_calls returned |
| 22 reasoning_effort low acceptance | ERROR | 502 | 2.3s | Acceptance only; cannot verify internal reasoning behavior. |
| 23 seed acceptance | PASS | 200 | 5.2s | Acceptance only; OpenAI does not promise deterministic output. |
| 24 logprobs and top_logprobs | FAIL | 200 | 11.0s | logprobs requested but missing or malformed |
| 25 legacy functions/function_call | FAIL | 200 | 20.7s | legacy function_call missing |
| 26 vision input with synthetic image | ERROR | 502 | 6.3s | Tests image-input acceptance, not vision accuracy or image generation. |
| 27 SSE normal | PASS | 200 | 5.0s |  |
| 28 SSE include_usage | FAIL | 200 | 0.8s | invalid chunk.object; chunk lacks id/created/model; chunk.choices is not an array; stream id/model changed across chunks; include_usage requested but final empty-choices usage chunk is missing or invalid |
| 29 SSE tool-call deltas | FAIL | 200 | 7.8s | no tool_calls returned |
| 30 SSE n=2 choices | FAIL | 200 | 0.0s | wrong number of streamed choices |
| 31 missing authentication | PASS | 401 | 0.0s |  |
| 32 invalid API key | PASS | 401 | 0.0s |  |
| 33 nonexistent model | FAIL | 502 | 0.0s | expected HTTP 400/404, got 502 |
| 34 missing model | FAIL | 200 | 7.7s | expected HTTP 400/422, got 200; error must contain message and type |
| 35 missing messages | PASS | 400 | 0.0s |  |
| 36 empty messages | PASS | 400 | 0.0s |  |
| 37 messages wrong type | PASS | 422 | 0.0s |  |
| 38 invalid message role | FAIL | 502 | 4.6s | expected HTTP 400/422, got 502 |
| 39 temperature outside range | FAIL | 200 | 5.6s | expected HTTP 400/422, got 200; error must contain message and type |
| 40 n=0 rejected | FAIL | 200 | 0.0s | expected HTTP 400/422, got 200; error must contain message and type |
| 41 negative token limit | FAIL | 200 | 5.3s | expected HTTP 400/422, got 200; error must contain message and type |
| 42 malformed JSON body | FAIL | 422 | 0.0s | expected HTTP 400, got 422 |
| 43 malformed tool declaration | FAIL | 200 | 7.5s | expected HTTP 400/422, got 200; error must contain message and type |
| 44 GET chat/completions rejected | FAIL | 200 | 0.0s | expected HTTP 404/405, got 200; error must contain message and type |
| 45 nonexistent endpoint | FAIL | 405 | 0.0s | expected HTTP 404, got 405 |
| 46 invalid response_format | FAIL | 200 | 5.5s | expected HTTP 400/422, got 200; error must contain message and type |
| 47 stream with invalid stream_options | FAIL | 200 | 0.0s | expected HTTP 400/422, got 200; error must contain message and type |
| 48 orphan tool result | FAIL | 502 | 3.9s | expected HTTP 400/422, got 502 |
| 49 models list | PASS | 200 | 0.0s |  |
| 50 retrieve requested model | FAIL | 200 | 0.0s | model metadata endpoint returned HTTP 200 with HTML instead of JSON |
| 51 Responses API basic probe | PASS | 200 | 6.0s |  |
| 52 OpenAI SDK parsing | PASS | 200 | 0.0s |  |

Full sanitized evidence and request bodies: results.json. API keys and request Authorization headers are not included.
