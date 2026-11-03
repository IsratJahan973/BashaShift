import { useCallback, useEffect, useRef, useState } from 'react';
import { emptyDatabase, loadDatabase, result } from '../lib/repository.js';

export function useAuth(client) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(Boolean(client));
  const [error, setError] = useState('');
  const identity = useRef(null);
  identity.current = session?.user.id;
  useEffect(() => {
    if (!client) return;
    let active = true;
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, value) => {
      if (active) setSession(value);
    });
    client.auth.getSession().then(({ data, error: failure }) => {
      if (!active) return;
      if (failure) { setError(failure.message); setLoading(false); }
      else { setSession(data.session); if (!data.session) setLoading(false); }
    }).catch(failure => { if (active) { setError(failure.message); setLoading(false); } });
    return () => { active = false; subscription.unsubscribe(); };
  }, [client]);
  const refreshProfile = useCallback(async () => {
    if (!session) return;
    const next = await result(client.from('profiles').select('*').eq('id', session.user.id).single());
    if (identity.current === next.id) { setProfile(next); setError(''); }
    return next;
  }, [client, session?.user.id]);
  useEffect(() => {
    let active = true;
    setProfile(null);
    setError('');
    if (!session) { setLoading(false); return () => { active = false; }; }
    setLoading(true);
    result(client.from('profiles').select('*').eq('id', session.user.id).single()).then(value => {
      if (active) { setProfile(value); setLoading(false); }
    }).catch(failure => { if (active) { setError('Your account profile could not be loaded. Please retry or sign out.'); setLoading(false); } });
    return () => { active = false; };
  }, [client, session?.user.id]);
  return { session, profile, loading, error, refreshProfile };
}

export function useCloudData(client, profile, enabled, identity) {
  const [snapshot, setSnapshot] = useState({ scope: null, data: emptyDatabase() });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const scope = enabled ? identity || 'public' : 'disabled';
  const generation = useRef(0);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const refresh = useCallback(async () => {
    if (!enabled || !client || currentScope.current !== scope) return;
    const request = ++generation.current;
    setLoading(true);
    try {
      const data = await loadDatabase(client, profile);
      if (request === generation.current && currentScope.current === scope) { setSnapshot({ scope, data }); setError(''); }
    } catch (failure) { if (request === generation.current && currentScope.current === scope) setError('Shared data could not be loaded. '+failure.message); }
    finally { if (request === generation.current && currentScope.current === scope) setLoading(false); }
  }, [client, profile, enabled, scope]);
  useEffect(() => {
    setSnapshot({ scope, data: emptyDatabase() });
    setError('');
    refresh();
    if (!enabled || !client) return;
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    const channel = client.channel('property-feed-'+scope)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'properties' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'property_images' }, refresh).subscribe();
    return () => { generation.current++; window.clearInterval(timer); window.removeEventListener('focus', refresh); client.removeChannel(channel); };
  }, [client, scope, enabled, refresh]);
  return { data: snapshot.scope === scope ? snapshot.data : emptyDatabase(), error, loading, refresh };
}
