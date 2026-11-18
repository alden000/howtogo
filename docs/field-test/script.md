# 怎么去? field-test script (owner-run, about 60 minutes per senior)

M5 AC 41 / AC 42. The owner runs this alone with one senior at a time. The owner's own phone plays "family".

**Hard rules**
- No audio, video or screen recordings.
- No photos of faces.
- No names written down, here or anywhere in the repo. Use participant numbers P1, P2 …
- The trip share goes only to the owner's phone and is ended at the finish.

**Files in this folder**
- `consent.md`: the consent line, read aloud first.
- `feedback-form.pdf` and `feedback-form.html`: the printable form.
- `questions.md`: the same questions as plain text.
- Notes template: at the end of this file.

---

## Before the day (owner)

1. Use a phone with the release build: the production URL, the live route data and a working family-share link.
2. Make sure the owner's phone is set up as a family contact on the test phone, or will be in Task 4.
3. Pick a familiar destination within one short trip: one bus ride, or two MRT stops. A clinic or a market works well. Check the weather.
4. Bring:
   - one printed feedback form per senior;
   - one copy of the notes template;
   - a pen;
   - a power bank;
   - an EZ-Link card or cash for the trip.
5. Charge the test phone above 60 %.

## On the day

### 0. Consent and start notes (5 min)
- Read the consent line in `consent.md`, in the senior's language. Go on only after a clear yes.
- Tick 已同意（口头）/ Agreed (spoken) on the form.
- Write the P-number, date, phone model and OS version, and the **battery %** at the start.
- 说 / Say: "等一下我会请你做几件事。我先不帮忙，看看应用自己说得清不清楚。" / "In a moment I'll ask you to do a few things. I won't help at first, so I can see whether the app explains itself."

### 1. Install the app (5 min)
- Let the senior add the app to the home screen with the in-app helper card or guide.
- Note: did the card appear, and did they follow it?
- If the owner had to do it, write **owner installed**, and why.

### 2. Task 1: find the way to a familiar place (10 min)
- 说 / Say: "请你用它找一下去［诊所 / 巴刹］怎么走。" / "Please use it to find the way to [the clinic / the market]."
- **Watch for 2 minutes without helping.** Then give the smallest hint that unblocks them, and note the hint.
- Note: the time to the route options, any wrong taps, and what they said aloud.

### 3. Task 2: make the text bigger (3 min)
- 说 / Say: "如果字太小，你会怎么把它变大？" / "If the writing were too small, how would you make it bigger?"
- Note: found it or not, and the time taken.

### 4. Task 3: a real short trip in guided mode (20 min)
- Start guidance on the chosen route and take the real trip together: one bus ride, or two MRT stops.
- Walk beside the senior. Don't point at the screen unless they are about to miss the stop.
- Note:
  - Did they **hear or feel the get-off alert in time**? Did they look at the phone at the right moments?
  - Did the phone screen stay on?
  - Anything confusing, with the screen name and the time.

### 5. Task 4: share the trip with family (5 min)
- During or just after the trip, ask: "请把你的行程分享给家人。" / "Please share your trip with your family."
- The owner's phone is the family. Check that the family page opened and showed them.
- End the share afterwards and check that the family page says it has ended.

### 6. Task 5: Help → call family (3 min)
- 说 / Say: "假设你迷路了，请找到'打电话给家人'。" / "Imagine you are lost. Please find 'call family'."
- Cancel the call before it connects.
- Note: found it or not, and how long it took.

### 7. Feedback form and finish (10 min)
- Fill the form in together. Read each question aloud. The senior points to a face, and the owner circles it.
- Write their words for questions 8–10 as close to verbatim as possible, still without a name.
- Note the **battery %** at the end.
- Thank them. Make sure the live share has ended.

## After the day (owner → PM)

- Put the forms and notes in a folder labelled with the P-numbers only.
- Type the notes into `docs/field-test/findings.md`, with P-numbers only. No names, phone numbers or addresses.
- The PM triages them:
  - S1/S2 bugs are fixed before 1.0;
  - S3/S4 go to a "Later" list.
- The owner's sign-off is recorded in `docs/process/director-log.md` (AC 42).

---

## Notes template (copy one per senior)

```
Participant: P__        Date: ____-__-__        Run by: owner
Phone model: __________   OS: Android __ / iOS __   Browser: __________
Battery at start: ___ %   Battery at end: ___ %   Screen-on setting: ______
Installed by: senior / owner (why: __________)

Task 1 find the way   time to options: ___ min   hints: __________________
Task 2 bigger text    found: Y / N   time: ___ s
Task 3 trip           route: ______________   alert in time: Y / late / missed
                      noticed by: sound / vibration / screen / not noticed
Task 4 share          family page opened: Y / N   ended cleanly: Y / N
Task 5 call family    found: Y / N   time: ___ s

Issues (one per line: time · screen · what happened · what she said)
__:__ · ______ · ____________________________________________
__:__ · ______ · ____________________________________________
__:__ · ______ · ____________________________________________
```
