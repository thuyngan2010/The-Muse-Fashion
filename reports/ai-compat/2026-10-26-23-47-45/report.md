# AI compatibility report: ag/gemini-3.8-flash-medium

Time: 2026-10-26 23:47:45 (Asia/Saigon)
Endpoint: http://localhost:20128/v1

Reference: [OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)

Scope: Chat Completions, SSE, function tools, validation/authentication, model discovery; one Responses API probe.

Not an OpenAI certification. No audio, image generation/editing, embeddings, uploads, stored-completion CRUD, rate-limit stress, billing, or exhaustive parameter-combination testing. Optional capability rejection is distinct from malformed output. Accepted sampler/reasoning parameters do not prove their implementation. BEHAVIOR_FAIL denotes observed prompt-following failures, not a malformed JSON response or proof that the gateway drops roles. FAIL includes strict HTTP-status differences from OpenAI as well as silently ignored feature settings.

Results: {"PASS":28,"FAIL":23,"BEHAVIOR_FAIL":1,"UNSUPPORTED":0,"ERROR":0}

| Case | Result | HTTP | Time | Findings |
|---|---|---:|---:|---|
| 01 basic JSON and response envelope | PASS | 200 | 4.8s |  |
| 02 multi-turn conversation | PASS | 200 | 5.4s |  |
| 03 system instruction priority | PASS | 200 | 4.2s |  |
| 04 developer role | BEHAVIOR_FAIL | 200 | 4.8s | Expected "DEV_OK", got "OK" |
| 05 array text content parts | PASS | 200 | 4.9s |  |
| 06 Vietnamese Unicode | PASS | 200 | 5.2s |  |
| 07 exact-text instruction with quotes/newlines | PASS | 200 | 4.4s | Prompt-following check, not proof of a JSON wire-escaping defect. |
| 08 multiple choices n=2 | FAIL | 200 | 4.7s | n=2 did not return two distinct choices |
| 09 temperature=0 acceptance | PASS | 200 | 4.6s | Acceptance only; sampling semantics cannot be proven by one sample. |
| 10 top_p acceptance | PASS | 200 | 4.6s | Acceptance only; not a statistical sampler test. |
| 11 frequency and presence penalties | PASS | 200 | 5.1s | Acceptance only. |
| 12 max_completion_tokens=1 enforced | FAIL | 200 | 6.7s | truncated completion must finish with length; completion token cap was exceeded |
| 13 legacy max_tokens=1 enforced | FAIL | 200 | 5.5s | truncated completion must finish with length; completion token cap was exceeded |
| 14 stop sequence enforced | FAIL | 200 | 5.2s | Expected "ALPHA", got "ALPHA<END>BETA" |
| 15 JSON object output | PASS | 200 | 6.3s |  |
| 16 strict JSON schema against conflicting prompt | FAIL | 200 | 5.3s | strict schema ignored: output is not JSON |
| 17 forced named function tool | FAIL | 200 | 4.0s | message.content must be string or null |
| 18 required function tool | FAIL | 200 | 3.8s | message.content must be string or null |
| 19 tool_choice none | PASS | 200 | 3.7s |  |
| 20 function tool result round trip | PASS | 200 | 3.2s |  |
| 21 parallel tool calls | FAIL | 200 | 3.8s | message.content must be string or null |
| 22 reasoning_effort low acceptance | PASS | 200 | 4.9s | Acceptance only; cannot verify internal reasoning behavior. |
| 23 seed acceptance | PASS | 200 | 4.3s | Acceptance only; OpenAI does not promise deterministic output. |
| 24 logprobs and top_logprobs | FAIL | 200 | 3.3s | logprobs requested but missing or malformed |
| 25 legacy functions/function_call | FAIL | 200 | 3.8s | legacy function_call missing |
| 26 vision input with synthetic image | PASS | 200 | 4.2s | Tests image-input acceptance, not vision accuracy or image generation. |
| 27 SSE normal | FAIL | 200 | 2.8s | missing data: [DONE] |
| 28 SSE include_usage | FAIL | 200 | 2.5s | missing data: [DONE]; include_usage requested but final empty-choices usage chunk is missing or invalid |
| 29 SSE tool-call deltas | FAIL | 200 | 2.9s | missing data: [DONE] |
| 30 SSE n=2 choices | FAIL | 200 | 2.9s | missing data: [DONE]; wrong number of streamed choices |
| 31 missing authentication | PASS | 401 | 0.0s |  |
| 32 invalid API key | PASS | 401 | 0.0s |  |
| 33 nonexistent model | PASS | 404 | 0.0s |  |
| 34 missing model | PASS | 400 | 0.0s |  |
| 35 missing messages | PASS | 400 | 0.3s |  |
| 36 empty messages | PASS | 400 | 0.2s |  |
| 37 messages wrong type | PASS | 400 | 0.3s |  |
| 38 invalid message role | PASS | 400 | 0.2s |  |
| 39 temperature outside range | PASS | 400 | 0.2s |  |
| 40 n=0 rejected | FAIL | 200 | 4.8s | expected HTTP 400/422, got 200; error must contain message and type |
| 41 negative token limit | FAIL | 200 | 3.7s | expected HTTP 400/422, got 200; error must contain message and type |
| 42 malformed JSON body | PASS | 400 | 0.0s |  |
| 43 malformed tool declaration | FAIL | 200 | 2.5s | expected HTTP 400/422, got 200; error must contain message and type |
| 44 GET chat/completions rejected | FAIL | 405 | 0.0s | error must contain message and type |
| 45 nonexistent endpoint | FAIL | 404 | 0.0s | error must contain message and type |
| 46 invalid response_format | FAIL | 200 | 4.0s | expected HTTP 400/422, got 200; error must contain message and type |
| 47 stream with invalid stream_options | FAIL | 200 | 2.8s | expected HTTP 400/422, got 200; error must contain message and type |
| 48 orphan tool result | FAIL | 200 | 4.3s | expected HTTP 400/422, got 200; error must contain message and type |
| 49 models list | PASS | 200 | 0.0s |  |
| 50 retrieve requested model | PASS | 200 | 0.0s |  |
| 51 Responses API basic probe | FAIL | 200 | 3.5s | successful response is not JSON |
| 52 OpenAI SDK parsing | PASS | 200 | 4.4s |  |

Full sanitized evidence and request bodies: results.json. API keys and request Authorization headers are not included.
