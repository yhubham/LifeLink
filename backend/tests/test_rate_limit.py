from app.services.rate_limit import AttemptLimiter


class FakeClock:
    def __init__(self, start: float = 1000.0) -> None:
        self.now = start

    def __call__(self) -> float:
        return self.now


def test_limiter_locks_and_frees_after_window():
    clock = FakeClock()
    limiter = AttemptLimiter(max_attempts=2, window_seconds=60, clock=clock)

    assert limiter.retry_after("ticket") == 0
    limiter.record_failure("ticket")
    assert limiter.retry_after("ticket") == 0
    limiter.record_failure("ticket")
    assert limiter.retry_after("ticket") == 60

    clock.now += 30
    assert limiter.retry_after("ticket") == 30

    clock.now += 31
    assert limiter.retry_after("ticket") == 0


def test_limiter_reset_clears_failures():
    clock = FakeClock()
    limiter = AttemptLimiter(max_attempts=1, window_seconds=60, clock=clock)

    limiter.record_failure("ticket")
    assert limiter.retry_after("ticket") == 60

    limiter.reset("ticket")
    assert limiter.retry_after("ticket") == 0


def test_limiter_keeps_memory_bounded():
    clock = FakeClock()
    limiter = AttemptLimiter(
        max_attempts=5, window_seconds=60, clock=clock, max_keys=10
    )

    for index in range(50):
        limiter.record_failure(f"ticket-{index}")

    assert len(limiter._buckets) <= 10
