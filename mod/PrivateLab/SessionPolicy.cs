namespace PrivateLab;

public readonly record struct SessionToken(long Client, int GameId, int HostId, int Mode);

public readonly record struct SessionSnapshot(
    bool HasClient, bool HasPlayer, bool JoinedOrStarted, bool Freeplay,
    bool SupportedNetworkMode, bool Host, bool Public, SessionToken Token);

public static class SessionPolicy
{
    public static bool Eligible(SessionSnapshot s) =>
        s.HasClient && s.HasPlayer && s.JoinedOrStarted &&
        (s.Freeplay || (s.SupportedNetworkMode && s.Host && !s.Public));

    public static bool Allowed(SessionSnapshot s, SessionToken? armed) =>
        Eligible(s) && (s.Freeplay || (armed.HasValue && armed.Value == s.Token));

    public static bool InRange(float squaredDistance, float radius) =>
        float.IsFinite(squaredDistance) && squaredDistance >= 0 &&
        float.IsFinite(radius) && radius > 0 && squaredDistance <= radius * radius;
}
