/**
 * Team Sync — Teams tier feature.
 * Syncs agent configurations, MCP servers, and conversation history
 * across team members in real-time via WebSocket.
 *
 * BUSL-1.1 — see packages/pro/LICENSE
 */

export interface TeamMember {
  id: string;
  email: string;
  name: string;
  role: 'owner' | 'admin' | 'member';
  joinedAt: string;
  online?: boolean;
}

export interface TeamConfig {
  teamId: string;
  name: string;
  members: TeamMember[];
  sharedAgents: string[];     // agent IDs shared across the team
  sharedMcpServers: string[]; // MCP server IDs shared across the team
}

export interface TeamSyncState {
  connected: boolean;
  teamConfig: TeamConfig | null;
  lastSyncedAt: string | null;
  error: string | null;
}

export interface TeamSyncEvent {
  type: 'config_updated' | 'member_joined' | 'member_left' | 'member_online' | 'member_offline' | 'agents_updated' | 'mcp_updated';
  payload: unknown;
  timestamp: string;
  sender: string;
}

const SYNC_SERVER = (typeof window !== 'undefined' && (window as any).__PILOS_SYNC_SERVER__)
  || 'wss://sync.pilos.ai';

const RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000]; // progressive backoff

export class TeamSync {
  private ws: WebSocket | null = null;
  private state: TeamSyncState = { connected: false, teamConfig: null, lastSyncedAt: null, error: null };
  private listeners: Array<(state: TeamSyncState) => void> = [];
  private eventListeners: Array<(event: TeamSyncEvent) => void> = [];
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private teamId: string | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly licenseKey: string) {}

  /** Connect to the sync server for a given team. */
  async connect(teamId: string): Promise<void> {
    this.teamId = teamId;
    this.reconnectAttempt = 0;
    this.doConnect();
  }

  private doConnect(): void {
    if (!this.teamId) return;

    try {
      this.ws = new WebSocket(`${SYNC_SERVER}/teams/${this.teamId}`);

      this.ws.onopen = () => {
        this.reconnectAttempt = 0;
        // Authenticate with license key
        this.send({ type: 'auth', licenseKey: this.licenseKey });
        this.startHeartbeat();
        this.updateState({ connected: true, error: null });
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch {
          // Ignore malformed messages
        }
      };

      this.ws.onclose = (event) => {
        this.stopHeartbeat();
        this.updateState({ connected: false });

        // Don't reconnect on intentional close (code 1000) or auth failure (4001)
        if (event.code === 1000 || event.code === 4001) return;

        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.updateState({ error: 'Connection error' });
      };
    } catch (err) {
      this.updateState({
        connected: false,
        error: err instanceof Error ? err.message : 'Failed to connect',
      });
      this.scheduleReconnect();
    }
  }

  private handleMessage(data: any): void {
    switch (data.type) {
      case 'auth_ok':
        // Server confirmed auth, sends current team config
        this.updateState({
          teamConfig: data.config as TeamConfig,
          lastSyncedAt: new Date().toISOString(),
        });
        break;

      case 'auth_error':
        this.updateState({ error: data.message || 'Authentication failed' });
        this.ws?.close(4001);
        break;

      case 'config_updated':
        this.updateState({
          teamConfig: data.config as TeamConfig,
          lastSyncedAt: new Date().toISOString(),
        });
        this.emitEvent({ type: 'config_updated', payload: data.config, timestamp: new Date().toISOString(), sender: data.sender });
        break;

      case 'member_online':
      case 'member_offline':
        if (this.state.teamConfig) {
          const members = this.state.teamConfig.members.map((m) =>
            m.id === data.memberId ? { ...m, online: data.type === 'member_online' } : m
          );
          this.updateState({
            teamConfig: { ...this.state.teamConfig, members },
          });
        }
        this.emitEvent({ type: data.type, payload: { memberId: data.memberId }, timestamp: new Date().toISOString(), sender: 'system' });
        break;

      case 'member_joined':
        if (this.state.teamConfig) {
          const members = [...this.state.teamConfig.members, data.member as TeamMember];
          this.updateState({
            teamConfig: { ...this.state.teamConfig, members },
          });
        }
        this.emitEvent({ type: 'member_joined', payload: data.member, timestamp: new Date().toISOString(), sender: 'system' });
        break;

      case 'member_left':
        if (this.state.teamConfig) {
          const members = this.state.teamConfig.members.filter((m) => m.id !== data.memberId);
          this.updateState({
            teamConfig: { ...this.state.teamConfig, members },
          });
        }
        this.emitEvent({ type: 'member_left', payload: { memberId: data.memberId }, timestamp: new Date().toISOString(), sender: 'system' });
        break;

      case 'agents_updated':
        if (this.state.teamConfig) {
          this.updateState({
            teamConfig: { ...this.state.teamConfig, sharedAgents: data.agentIds },
            lastSyncedAt: new Date().toISOString(),
          });
        }
        this.emitEvent({ type: 'agents_updated', payload: data.agentIds, timestamp: new Date().toISOString(), sender: data.sender });
        break;

      case 'mcp_updated':
        if (this.state.teamConfig) {
          this.updateState({
            teamConfig: { ...this.state.teamConfig, sharedMcpServers: data.serverIds },
            lastSyncedAt: new Date().toISOString(),
          });
        }
        this.emitEvent({ type: 'mcp_updated', payload: data.serverIds, timestamp: new Date().toISOString(), sender: data.sender });
        break;

      case 'pong':
        // Heartbeat response — connection is alive
        break;
    }
  }

  /** Push updated shared agents to the team. */
  shareAgents(agentIds: string[]): void {
    this.send({ type: 'share_agents', agentIds });
  }

  /** Push updated shared MCP servers to the team. */
  shareMcpServers(serverIds: string[]): void {
    this.send({ type: 'share_mcp_servers', serverIds });
  }

  /** Invite a new member by email. */
  inviteMember(email: string, role: 'admin' | 'member' = 'member'): void {
    this.send({ type: 'invite_member', email, role });
  }

  /** Remove a member from the team. */
  removeMember(memberId: string): void {
    this.send({ type: 'remove_member', memberId });
  }

  /** Disconnect and stop reconnection attempts. */
  disconnect(): void {
    this.teamId = null;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close(1000);
      this.ws = null;
    }
    this.updateState({ connected: false, teamConfig: null, error: null });
  }

  getState(): TeamSyncState {
    return { ...this.state };
  }

  /** Subscribe to state changes. Returns unsubscribe function. */
  subscribe(listener: (state: TeamSyncState) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /** Subscribe to sync events (member joins, config changes, etc). */
  onEvent(listener: (event: TeamSyncEvent) => void): () => void {
    this.eventListeners.push(listener);
    return () => {
      this.eventListeners = this.eventListeners.filter((l) => l !== listener);
    };
  }

  // ── Private helpers ──

  private send(data: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private updateState(patch: Partial<TeamSyncState>): void {
    this.state = { ...this.state, ...patch };
    const snapshot = { ...this.state };
    this.listeners.forEach((l) => l(snapshot));
  }

  private emitEvent(event: TeamSyncEvent): void {
    this.eventListeners.forEach((l) => l(event));
  }

  private scheduleReconnect(): void {
    if (!this.teamId) return;
    const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)];
    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => this.doConnect(), delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: 'ping' });
    }, 30_000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}
