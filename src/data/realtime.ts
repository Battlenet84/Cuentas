import { getSupabaseClient } from '../lib/supabase';

export type RealtimeStatus = 'idle' | 'connecting' | 'connected' | 'syncing' | 'error';

type SubscribeToGroupChangesParams = {
  shareToken: string;
  onChange: () => void;
  onStatusChange?: (status: RealtimeStatus) => void;
  onError?: (error: unknown) => void;
};

export function subscribeToGroupChanges({
  shareToken,
  onChange,
  onStatusChange,
  onError
}: SubscribeToGroupChangesParams): () => void {
  const supabase = getSupabaseClient();
  const channel = supabase.channel(`group:${shareToken}`);

  onStatusChange?.('connecting');

  channel
    .on('broadcast', { event: 'group_changed' }, () => {
      onChange();
    })
    .subscribe((status, error) => {
      if (status === 'SUBSCRIBED') {
        onStatusChange?.('connected');
        return;
      }

      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        onStatusChange?.('error');
        if (error) onError?.(error);
      }
    });

  return () => {
    void supabase.removeChannel(channel);
  };
}
