# Claude Task: Repair One-on-One Time-Slot Loading

## Problem

The Calendly-style calendar displays during one-on-one booking, but selecting an enabled date does not populate the available time buttons.

This is a functionality bug. Preserve the current calendar design.

## Guardrails

- Diagnose the exact cause before editing.
- Do not hardcode fake appointment times.
- Do not remove or bypass availability rules, blocked dates, date ranges, overrides, session-type restrictions, capacity, buffers, maximum daily bookings, time-zone conversion, slot holds, or double-booking prevention.
- Do not rebuild the complete booking system.
- Do not change the member portal, ministry portal, UV logo, Member View button, Sign Out button, or unrelated website styling.

## Trace This Complete Flow

```text
Calendar date click
→ bookingDateInput receives YYYY-MM-DD
→ loadTimeSlots()
→ releaseCurrentHold()
→ populateTimeSelect()
→ computeOpenSlots()
→ bookingTimeSelect receives options
→ renderBookingTimeButtons()
→ visible time buttons appear
```

Find the exact point where this chain stops.

## Required Checks

1. Confirm the selected date is written in `YYYY-MM-DD` format.
2. Confirm the chosen 15-minute or 30-minute session remains selected.
3. Confirm `loadTimeSlots()` runs after the calendar click.
4. Confirm the correct duration and session-type ID reach `computeOpenSlots()`.
5. Confirm `AVAILABILITY_RULES` loads from Firestore in production and preview storage/defaults in preview mode.
6. Confirm `dayOfWeek` values match the selected date.
7. Confirm `sessionTypeIds` is not incorrectly excluding the session.
8. Confirm preview-only blocked dates never affect production.
9. Confirm `releaseCurrentHold()` does not throw before slots load.
10. Confirm Firestore permits the reads needed for bookings, holds, availability, blockouts, ranges, and overrides.
11. Confirm time-zone conversion does not remove valid slots.
12. Confirm the hidden `bookingTime` select receives option elements.
13. Confirm `renderBookingTimeButtons()` receives those options.
14. Inspect the browser console and expose any error currently swallowed by a broad `catch`.
15. Check for stale or duplicate listeners from the former native date input.

## Required Behavior

After a visitor selects a session, continues, and clicks an enabled date, available appointment times must immediately appear in the right-hand time column.

Show these explicit states:

- Loading: `Loading available times…`
- No openings: `No available times for this date. Please choose another date.`
- Technical failure: show a clear visitor-facing error and log the actual error to the console.

Never leave the time column blank.

Selecting a time must:

- Highlight the time button.
- Write the time into the hidden booking-time field.
- Enable Continue.
- Preserve the chosen date and time in the booking summary.
- Create the temporary hold.
- Prevent double booking.

## Verification

Test all of the following:

- 15-minute session on an available date
- 30-minute session on an available date
- Current month and next month
- Blocked date
- Date outside the weekly schedule
- Fully booked date
- Desktop and mobile layouts
- GitHub Pages preview mode
- Production Firebase mode

## Completion Report

Implement the fix directly. Then report:

1. The exact cause.
2. Every file changed.
3. The repaired code path.
4. The tests performed and results.

Do not stop after explaining the issue. Complete and verify the repair.
