using BepInEx;
using BepInEx.Logging;
using BepInEx.Unity.IL2CPP;
using Il2CppInterop.Runtime.Attributes;
using InnerNet;
using UnityEngine;

namespace PrivateLab;

[BepInPlugin("local.amongus.privatelab", "Among Us Private Lab", "1.0.0")]
[BepInProcess("Among Us.exe")]
public sealed class Plugin : BasePlugin
{
    internal static ManualLogSource LabLog = null!;
    internal const string ExpectedBuild = "3b4ee0911f414b62b99cd35be77e688b";
    private LabMenu? menu;

    public override void Load()
    {
        LabLog = Log;
        if (!string.Equals(Application.buildGUID, ExpectedBuild, StringComparison.OrdinalIgnoreCase))
        {
            Log.LogError($"Private Lab disabled: unverified build {Application.buildGUID}; expected {ExpectedBuild}.");
            return;
        }
        menu = AddComponent<LabMenu>();
        Log.LogInfo("Private Lab loaded. F6 opens the in-game menu. Public/non-host sessions are locked.");
    }

    public override bool Unload()
    {
        if (menu)
        {
            menu!.Shutdown();
            UnityEngine.Object.Destroy(menu);
        }
        return true;
    }
}

public sealed class LabMenu : MonoBehaviour
{
    private const float KillRadius = 2.5f;
    private bool visible;
    private bool consent;
    private bool noclip;
    private bool overlay;
    private bool faulted;
    private SessionToken? armed;
    private SessionToken? observedSession;
    private Collider2D? changedCollider;
    private bool originalColliderEnabled;
    private Vector2 scroll;
    private string status = "F6 toggles this menu. Use only with consenting test players.";
    private float nextEliminateTime;

    public LabMenu(IntPtr pointer) : base(pointer) { }

    private static SessionSnapshot Snapshot()
    {
        var client = AmongUsClient.Instance;
        var player = PlayerControl.LocalPlayer;
        if (!client) return default;
        return new SessionSnapshot(
            true, player, client.GameState is InnerNetClient.GameStates.Joined or InnerNetClient.GameStates.Started,
            client.NetworkMode == NetworkModes.FreePlay,
            client.NetworkMode is NetworkModes.LocalGame or NetworkModes.OnlineGame,
            client.AmHost, client.IsGamePublic,
            new SessionToken(client.Pointer.ToInt64(), client.GameId, client.HostId, (int)client.NetworkMode));
    }

    [HideFromIl2Cpp]
    private bool Allowed() => !faulted && SessionPolicy.Allowed(Snapshot(), armed);

    public void Update()
    {
        if (faulted) return;
        try
        {
            if (Input.GetKeyDown(KeyCode.F6)) visible = !visible;
            var snapshot = Snapshot();
            var eligible = SessionPolicy.Eligible(snapshot);
            if (!eligible || (observedSession.HasValue && observedSession.Value != snapshot.Token) ||
                (armed.HasValue && armed.Value != snapshot.Token))
                Disarm();
            observedSession = eligible ? snapshot.Token : null;
            if (!Allowed())
            {
                RestoreCollider();
                return;
            }
            var local = PlayerControl.LocalPlayer;
            if (noclip && CanAct(local))
            {
                var collider = local.Collider;
                if (changedCollider && (!collider || changedCollider!.Pointer != collider.Pointer))
                    RestoreCollider();
                if (collider)
                {
                    if (!changedCollider)
                    {
                        changedCollider = collider;
                        originalColliderEnabled = collider.enabled;
                    }
                    collider.enabled = false;
                }
            }
            else RestoreCollider();
        }
        catch (Exception error) { FailClosed(error); }
    }

    private static bool CanAct(PlayerControl? local) =>
        local && local!.Data != null && !local.Data.IsDead && !local.Data.Disconnected &&
        AmongUsClient.Instance && AmongUsClient.Instance.GameState == InnerNetClient.GameStates.Started &&
        !MeetingHud.Instance && !ExileController.Instance && local.CanMove &&
        !local.inVent && !local.walkingToVent && !local.onLadder && !local.inMovingPlat;

    [HideFromIl2Cpp]
    private void RestoreCollider()
    {
        if (changedCollider) changedCollider!.enabled = originalColliderEnabled;
        changedCollider = null;
    }

    [HideFromIl2Cpp]
    private void Disarm()
    {
        if (armed.HasValue || consent || noclip || overlay)
            status = "Session changed/disarmed. Private hosted sessions must be armed again.";
        armed = null;
        consent = noclip = overlay = false;
        RestoreCollider();
    }

    [HideFromIl2Cpp]
    internal void Shutdown() => Disarm();
    public void OnDisable() => Disarm();
    public void OnDestroy() => Disarm();

    [HideFromIl2Cpp]
    private void FailClosed(Exception error)
    {
        faulted = true;
        try { Disarm(); }
        catch (Exception restoreError) { Plugin.LabLog.LogError(restoreError); }
        Plugin.LabLog.LogError(error);
        status = "Runtime error: disabled for safety. See BepInEx\\LogOutput.log and restart.";
    }

    public void OnGUI()
    {
        if (!visible && (!overlay || faulted)) return;
        var oldColor = GUI.color;
        var oldEnabled = GUI.enabled;
        try
        {
            var allowed = Allowed();
            if (allowed && overlay) DrawOverlay();
            if (visible) DrawMenu(allowed);
        }
        catch (Exception error) { FailClosed(error); }
        finally
        {
            GUI.color = oldColor;
            GUI.enabled = oldEnabled;
        }
    }

    [HideFromIl2Cpp]
    private void DrawMenu(bool allowed)
    {
        var width = Math.Min(760f, Screen.width - 24f);
        var height = Math.Min(600f, Screen.height - 24f);
        GUI.Box(new Rect(12, 12, width, height), "");
        GUI.Label(new Rect(28, 22, width - 115, 30), "PRIVATE LAB  /  AMONG US  /  F6");
        if (GUI.Button(new Rect(width - 70, 20, 70, 28), "Close")) visible = false;
        GUI.Label(new Rect(28, 54, width - 32, 38), status);
        if (faulted) return;
        var snapshot = Snapshot();
        if (!SessionPolicy.Eligible(snapshot))
        {
            GUI.Label(new Rect(28, 100, width - 44, 80),
                "LOCKED: enter Freeplay or host a PRIVATE test lobby.\nNo roles, positions or actions are available in public/non-host sessions.");
            return;
        }
        if (!allowed)
        {
            consent = GUI.Toggle(new Rect(28, 104, width - 44, 30), consent,
                "I host this private test lobby and every player consents.");
            GUI.enabled = consent;
            if (GUI.Button(new Rect(28, 146, 260, 32), "Arm this test session"))
            {
                // Recheck authority at the action, not just when the menu was drawn.
                var current = Snapshot();
                if (consent && SessionPolicy.Eligible(current) && current.Token == snapshot.Token)
                {
                    armed = current.Token;
                    status = "Test session armed. Public switch/host loss/disconnect disarms automatically.";
                }
            }
            GUI.enabled = true;
            return;
        }
        overlay = GUI.Toggle(new Rect(28, 100, 280, 30), overlay, "World position + role labels");
        var nextNoclip = GUI.Toggle(new Rect(310, 100, 240, 30), noclip, "Noclip (local body collider)");
        if (nextNoclip != noclip)
        {
            noclip = nextNoclip;
            if (!noclip) RestoreCollider();
        }
        if (!snapshot.Freeplay && GUI.Button(new Rect(width - 115, 100, 110, 28), "Disarm"))
        {
            Disarm();
            return;
        }
        var local = PlayerControl.LocalPlayer;
        var nearest = FindNearest(local);
        GUI.enabled = CanAct(local) && nearest && Time.unscaledTime >= nextEliminateTime;
        var label = nearest ? $"Eliminate nearest: {SafeName(nearest!.Data.PlayerName)}" : "No living target within 2.5 units";
        if (GUI.Button(new Rect(28, 140, width - 44, 34), label)) EliminateNearest();
        GUI.enabled = true;
        GUI.Label(new Rect(28, 182, width - 44, 40),
            "Noclip pauses during meetings/death/transitions. Return inside the map before disabling.\nKick is host-only, immediate, non-ban; no voting RPC is used.");

        var players = PlayerControl.AllPlayerControls;
        var count = players?.Count ?? 0;
        var viewportHeight = Math.Max(60, height - 246);
        scroll = GUI.BeginScrollView(new Rect(28, 230, width - 44, viewportHeight), scroll,
            new Rect(0, 0, width - 68, Math.Max(viewportHeight, count * 42)));
        try
        {
            for (var i = 0; i < count; i++)
            {
                var player = players![i];
                if (!player || player.Data == null || player.Data.Disconnected) continue;
                var data = player.Data;
                var position = player.GetTruePosition();
                var role = data.Role;
                var impostor = role != null && role.IsImpostor;
                GUI.color = impostor ? new Color(1f, .36f, .36f, 1f) : Color.white;
                var roleText = role == null ? "role not assigned" : (impostor ? "IMPOSTOR" : "CREW") + $" / {data.RoleType}";
                GUI.Label(new Rect(4, i * 42, width - 175, 40),
                    $"{SafeName(data.PlayerName)}{(data.IsDead ? " [dead]" : "")}  •  {roleText}\n" +
                    $"x {position.x:F2}  y {position.y:F2}  •  player {player.PlayerId}");
                GUI.color = Color.white;
                GUI.enabled = !snapshot.Freeplay && AmongUsClient.Instance.AmHost &&
                    player.Pointer != local.Pointer && data.ClientId >= 0 && data.ClientId != AmongUsClient.Instance.HostId;
                if (GUI.Button(new Rect(width - 166, i * 42 + 4, 90, 30), "Kick now"))
                    Kick(player.PlayerId, data.ClientId);
                GUI.enabled = true;
            }
        }
        finally { GUI.EndScrollView(); }
    }

    [HideFromIl2Cpp]
    private void DrawOverlay()
    {
        var camera = Camera.main;
        var players = PlayerControl.AllPlayerControls;
        if (!camera || players == null) return;
        for (var i = 0; i < players.Count; i++)
        {
            var player = players[i];
            if (!player || player.Data == null || player.Data.Disconnected) continue;
            var data = player.Data;
            var position = player.GetTruePosition();
            var screen = camera.WorldToScreenPoint(new Vector3(position.x, position.y, player.transform.position.z));
            if (screen.z <= 0) continue;
            GUI.color = data.Role != null && data.Role.IsImpostor ? new Color(1f, .3f, .3f, 1f) : Color.white;
            GUI.Label(new Rect(screen.x - 100, Screen.height - screen.y - 45, 250, 50),
                $"{SafeName(data.PlayerName)}  [{(data.Role == null ? "unknown" : data.RoleType.ToString())}]\n" +
                $"({position.x:F2}, {position.y:F2}){(data.IsDead ? " dead" : "")}");
        }
        GUI.color = Color.white;
    }

    private static PlayerControl? FindNearest(PlayerControl? local)
    {
        if (!CanAct(local)) return null;
        var players = PlayerControl.AllPlayerControls;
        if (players == null) return null;
        var origin = local!.GetTruePosition();
        PlayerControl? nearest = null;
        var best = KillRadius * KillRadius;
        for (var i = 0; i < players.Count; i++)
        {
            var target = players[i];
            if (!target || target.Pointer == local.Pointer || target.Data == null ||
                target.Data.Disconnected || target.Data.IsDead || target.inVent ||
                target.onLadder || target.inMovingPlat) continue;
            var distance = (target.GetTruePosition() - origin).sqrMagnitude;
            if (!SessionPolicy.InRange(distance, KillRadius) || distance > best) continue;
            best = distance;
            nearest = target;
        }
        return nearest;
    }

    [HideFromIl2Cpp]
    private void EliminateNearest()
    {
        if (!Allowed() || Time.unscaledTime < nextEliminateTime) return;
        var local = PlayerControl.LocalPlayer;
        var target = FindNearest(local);
        if (!target) return;
        var client = AmongUsClient.Instance;
        if (!Allowed()) return;
        nextEliminateTime = Time.unscaledTime + .75f;
        if (client.NetworkMode == NetworkModes.FreePlay)
            local.MurderPlayer(target!, MurderResultFlags.Succeeded);
        else if (client.AmHost && !client.IsGamePublic)
            local.RpcMurderPlayer(target!, true);
        status = $"Eliminate requested for {SafeName(target!.Data.PlayerName)}. Host/game rules may reject an action.";
    }

    [HideFromIl2Cpp]
    private void Kick(byte playerId, int clientId)
    {
        if (!Allowed()) return;
        var client = AmongUsClient.Instance;
        if (!client || !client.AmHost || client.IsGamePublic || client.NetworkMode == NetworkModes.FreePlay ||
            clientId < 0 || clientId == client.ClientId || clientId == client.HostId) return;
        var players = PlayerControl.AllPlayerControls;
        if (players == null) return;
        for (var i = 0; i < players.Count; i++)
        {
            var target = players[i];
            if (!target || target.Data == null || target.PlayerId != playerId ||
                target.Data.ClientId != clientId || target.Data.Disconnected ||
                target.Pointer == PlayerControl.LocalPlayer.Pointer) continue;
            client.KickPlayer(clientId, false);
            status = $"Host kick requested for player {playerId} (client {clientId}).";
            return;
        }
    }

    private static string SafeName(string? value)
    {
        var text = new string((value ?? "?").Where(c => !char.IsControl(c)).Take(28).ToArray());
        return text.Replace('<', '[').Replace('>', ']');
    }
}
