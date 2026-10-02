/**
 * Calendar/timer split limits. The calendar never gets narrower than the
 * header needs, so its buttons never squeeze together; when the screen can't
 * fit both side by side, the timer stacks below the calendar instead.
 * Keep in sync with the `.timer-dock` rules and the `side` / `stacked`
 * variants in `src/index.css`.
 */
export const CALENDAR_MIN_WIDTH = 480
export const TIMER_MIN_WIDTH = 320
export const CALENDAR_MIN_HEIGHT = 300
export const TIMER_MIN_HEIGHT = 240

/** Wide enough (and landscape) for calendar and timer side by side. */
export const SIDE_BY_SIDE_QUERY = `(orientation: landscape) and (min-width: ${CALENDAR_MIN_WIDTH + TIMER_MIN_WIDTH}px)`
