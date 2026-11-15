# Failure log

Cases where the pipeline did something wrong or unexpected, what caused it, and what changed.

| # | Date | Input | Expected | Got | Cause | Fix / status |
|---|---|---|---|---|---|---|
| 1 | 2026-11-15 | "Is the 2BR condo in Makati still available? I'd like a viewing this Saturday." | needs_human = false | needs_human = true | Model can't confirm availability, so it plays safe. Test expectation may be too strict. | Open: decide whether "asks about availability" should need a human. |
| 2 | 2026-11-15 | Any inquiry (afternoon of 2026-11-15) | Answer in seconds | 94 s, then fallback to human review | Gemini Flash returned 503 "high demand" / timed out 3× at 30 s. | Added a fallback model, shortened timeouts, then made Flash-Lite the main model (~1–2 s per inquiry). |
| 3 | 2026-11-15 | Same Makati condo message | category = buyer | category = renter (Flash-Lite) | Message never says buy or rent; Flash guessed buyer, Flash-Lite guessed renter. | Open: measure Flash vs Flash-Lite on the full test set; consider a prompt rule for "available + viewing" with no buy/rent signal. |
