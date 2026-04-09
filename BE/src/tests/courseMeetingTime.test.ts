/**
 * Unit tests for hasPlausibleMeetingTimes — no DB required.
 */
import { hasPlausibleMeetingTimes } from "../modules/classes/courseMeetingTime.util";


describe("hasPlausibleMeetingTimes", () => {
  it("accepts a normal 80-minute lecture block", () => {
    expect(hasPlausibleMeetingTimes("09:30", "10:50")).toBe(true);
  });

  it("accepts a 3-hour lab", () => {
    expect(hasPlausibleMeetingTimes("14:00", "17:00")).toBe(true);
  });

  it("rejects identical start and end times", () => {
    expect(hasPlausibleMeetingTimes("09:00", "09:00")).toBe(false);
  });

  it("rejects the 00:00–23:59 all-day placeholder", () => {
    expect(hasPlausibleMeetingTimes("00:00", "23:59")).toBe(false);
  });

  it("rejects blocks longer than 14 hours", () => {
    expect(hasPlausibleMeetingTimes("00:00", "15:00")).toBe(false);
  });

  it("rejects blocks where end is before start", () => {
    expect(hasPlausibleMeetingTimes("13:00", "09:00")).toBe(false);
  });

  it("rejects null / missing times", () => {
    expect(hasPlausibleMeetingTimes(null, "10:00")).toBe(false);
    expect(hasPlausibleMeetingTimes("09:00", null)).toBe(false);
    expect(hasPlausibleMeetingTimes(null, null)).toBe(false);
    expect(hasPlausibleMeetingTimes("", "")).toBe(false);
  });
});
