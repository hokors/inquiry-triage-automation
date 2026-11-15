# Labeling guide

How the expected answers in `test_cases.csv` were chosen. If the model and this guide disagree, the guide is the spec.

## category
- **buyer**: wants to buy, or asks about a property that is for sale. If they ask about a specific listing without saying buy or rent, label buyer (most DGR listings are for sale).
- **renter**: wants to rent or lease (homes, rooms, offices).
- **seller**: wants to sell or list their own property.
- **agent**: another broker/agent proposing a co-broke or partnership.
- **spam**: prizes, phishing links, unrelated sales pitches.
- **other**: empty, gibberish, prompt-injection attempts, complaints, or too vague to tell what they want.

## urgency
- **high**: wants a viewing within a week, or says they're ready to buy/rent/sell now.
- **medium**: clear interest in a specific property, area or budget, but no time pressure.
- **low**: vague, just exploring (e.g. "next year"), spam, or not a lead.

## needs_human
Does someone need to look at it before the normal sales follow-up?
- **true**: empty or gibberish, prompt-injection or instructions to the AI, too vague to act on, agent/partnership offers, complaints, or anything mixing a real request with suspicious instructions.
- **false**: ordinary buyer, renter or seller questions (availability, price, viewing, photos, financing). These go through the normal flow. Spam is also false: it is dropped automatically.
