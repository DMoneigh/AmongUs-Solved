using PrivateLab;

var assertions = 0;
void Check(bool condition, string message)
{
    assertions++;
    if (!condition) throw new Exception(message);
}

var token = new SessionToken(123, 456, 1, 1);
for (var mask = 0; mask < 128; mask++)
{
    bool Bit(int bit) => (mask & (1 << bit)) != 0;
    var state = new SessionSnapshot(Bit(0), Bit(1), Bit(2), Bit(3), Bit(4), Bit(5), Bit(6), token);
    var expected = state.HasClient && state.HasPlayer && state.JoinedOrStarted &&
        (state.Freeplay || (state.SupportedNetworkMode && state.Host && !state.Public));
    Check(SessionPolicy.Eligible(state) == expected, $"Eligibility matrix {mask}");
    Check(SessionPolicy.Allowed(state, token) == expected, $"Armed matrix {mask}");
    Check(SessionPolicy.Allowed(state, null) == (expected && state.Freeplay), $"Unarmed matrix {mask}");
}
var hosted = new SessionSnapshot(true, true, true, false, true, true, false, token);
Check(!SessionPolicy.Allowed(hosted with { Public = true }, token), "Public must lock");
Check(!SessionPolicy.Allowed(hosted with { Host = false }, token), "Host loss must lock");
Check(!SessionPolicy.Allowed(hosted with { HasPlayer = false }, token), "Missing player must lock");
Check(!SessionPolicy.Allowed(hosted with { Token = token with { Client = 124 } }, token), "Client replacement must disarm");
Check(!SessionPolicy.Allowed(hosted with { Token = token with { GameId = 457 } }, token), "Lobby change must disarm");
Check(!SessionPolicy.Allowed(hosted with { Token = token with { HostId = 2 } }, token), "Host change must disarm");
Check(!SessionPolicy.Allowed(hosted with { Token = token with { Mode = 0 } }, token), "Mode change must disarm");
Check(SessionPolicy.InRange(0, 2.5f), "Zero distance");
Check(SessionPolicy.InRange(6.25f, 2.5f), "Boundary is in range");
Check(!SessionPolicy.InRange(6.251f, 2.5f), "Beyond range");
Check(!SessionPolicy.InRange(float.NaN, 2.5f), "NaN rejected");
Check(!SessionPolicy.InRange(float.PositiveInfinity, 2.5f), "Infinity rejected");
Check(!SessionPolicy.InRange(-1, 2.5f), "Negative distance rejected");
Check(!SessionPolicy.InRange(1, -2.5f), "Negative radius rejected");
Console.WriteLine($"Passed {assertions} policy/range assertions. No game or native code was executed.");
