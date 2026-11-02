"use client";

import { Button, Card, ErrorBox, Hash, Loading, Pill } from "@/components/ui";
import { api, formatTs, type Device } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";

export default function DevicesPage() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useApi<Device[]>("/devices");

  async function revoke(d: Device) {
    if (!confirm(`Revoke "${d.name}"? It will no longer be able to upload evidence. Evidence it already signed stays valid.`)) return;
    await api.post(`/devices/${d.id}/revoke`);
    reload();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="heading text-2xl">Devices</h1>
        <p className="text-sm text-muted">
          Each phone makes its own Ed25519 signing key when it is enrolled. The private key never leaves the phone. Revoke a lost or stolen phone here.
        </p>
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}
      <Card>
        {loading && !data ? (
          <Loading />
        ) : data?.length === 0 ? (
          <p className="text-sm text-muted">No devices yet. Sign in on the ChainProof phone app to enroll one.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr>
                  <th className="pb-2 font-medium">Device</th>
                  <th className="pb-2 font-medium">Owner</th>
                  <th className="pb-2 font-medium">Public key</th>
                  <th className="pb-2 font-medium">Enrolled</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data?.map((d) => (
                  <tr key={d.id}>
                    <td className="py-2 font-medium">{d.name}</td>
                    <td className="py-2">{d.user_name}</td>
                    <td className="py-2"><Hash value={d.public_key_hex} short={10} /></td>
                    <td className="py-2 text-muted">{formatTs(d.enrolled_at)}</td>
                    <td className="py-2">{d.revoked ? <Pill tone="bad">Revoked {formatTs(d.revoked_at)}</Pill> : <Pill>Active</Pill>}</td>
                    <td className="py-2 text-right">
                      {!d.revoked && (user?.role === "supervisor" || d.user_id === user?.id) && (
                        <Button variant="secondary" onClick={() => revoke(d)}>Revoke</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
