'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import {
  usePatchProvisionStep,
  useProvisionCommit,
  useProvisionSession,
} from '../../../lib/hooks/queries/use-dids';
import { useTenantDids, useTenantExtensions } from '../../../lib/hooks/queries/use-tenant';
import { ModuleAccessGate } from '../shared/ModuleShell';
import { PageContainer, PageHeader } from '../../layout/PageHeader';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { AssignDidDrawer } from '../phone-numbers/AssignDidDrawer';

const STEPS = ['User', 'Extension', 'Device', 'DID', 'Voicemail', 'Review'] as const;

export function ProvisionEmployeeWizard() {
  const router = useRouter();
  const startSession = useProvisionSession();
  const commit = useProvisionCommit();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const patch = usePatchProvisionStep(sessionId);
  const didsQuery = useTenantDids();
  const extensionsQuery = useTenantExtensions();

  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [didDrawerOpen, setDidDrawerOpen] = useState(false);

  const [userForm, setUserForm] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    roleName: 'User',
  });
  const [extForm, setExtForm] = useState({ extension: '', lineName: '', callerIdName: '' });
  const [deviceForm, setDeviceForm] = useState({
    skip: true,
    macAddress: '',
    manufacturer: 'GRANDSTREAM',
    model: 'GRP2612',
  });
  const [didForm, setDidForm] = useState({ skip: true, phoneNumberId: '' });
  const [vmForm, setVmForm] = useState({ skip: false, enabled: true });

  useEffect(() => {
    if (!sessionId && !startSession.isPending && !startSession.data) {
      void startSession.mutateAsync().then((s) => setSessionId(String(s.sessionId)));
    }
  }, [sessionId, startSession]);

  useEffect(() => {
    if (extensionsQuery.data?.length && !extForm.extension) {
      const nums = extensionsQuery.data
        .map((e) => parseInt(String(e.extension ?? ''), 10))
        .filter((n) => !Number.isNaN(n));
      const next = (nums.length ? Math.max(...nums) : 1000) + 1;
      setExtForm((f) => ({ ...f, extension: String(next) }));
    }
  }, [extensionsQuery.data, extForm.extension]);

  const next = async () => {
    setError(null);
    if (!sessionId) return;
    try {
      if (step === 0) {
        await patch.mutateAsync({ step: 'user', payload: userForm });
      } else if (step === 1) {
        await patch.mutateAsync({
          step: 'extension',
          payload: {
            ...extForm,
            callerIdName: extForm.callerIdName || `${userForm.firstName} ${userForm.lastName}`.trim(),
          },
        });
      } else if (step === 2) {
        await patch.mutateAsync({ step: 'device', payload: deviceForm });
      } else if (step === 3) {
        await patch.mutateAsync({ step: 'did', payload: didForm });
      } else if (step === 4) {
        await patch.mutateAsync({ step: 'voicemail', payload: vmForm });
      } else if (step === 5) {
        await commit.mutateAsync(sessionId);
        router.push('/people/users');
        return;
      }
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Step failed');
    }
  };

  const back = () => setStep((s) => Math.max(0, s - 1));

  const selectedDid = (didsQuery.data ?? []).find((d) => String(d.id) === didForm.phoneNumberId);

  return (
    <ModuleAccessGate moduleId="provision-employee">
      {({ module }) => (
        <PageContainer>
          <PageHeader title={module.label} description={module.description} />

          <div className="mb-8 flex flex-wrap gap-2">
            {STEPS.map((label, i) => (
              <div
                key={label}
                className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
                  i === step ? 'bg-primary text-primary-foreground' : i < step ? 'bg-emerald-100 text-emerald-800' : 'bg-muted text-muted-foreground'
                }`}
              >
                {i < step ? <Check className="h-3 w-3" /> : null}
                {label}
              </div>
            ))}
          </div>

          {step === 0 ? (
            <div className="max-w-md space-y-4">
              <Input placeholder="First name" value={userForm.firstName} onChange={(e) => setUserForm({ ...userForm, firstName: e.target.value })} />
              <Input placeholder="Last name" value={userForm.lastName} onChange={(e) => setUserForm({ ...userForm, lastName: e.target.value })} />
              <Input placeholder="Email" type="email" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} />
              <Input placeholder="Password" type="password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} />
            </div>
          ) : null}

          {step === 1 ? (
            <div className="max-w-md space-y-4">
              <Input placeholder="Extension" value={extForm.extension} onChange={(e) => setExtForm({ ...extForm, extension: e.target.value })} />
              <Input placeholder="Line name" value={extForm.lineName} onChange={(e) => setExtForm({ ...extForm, lineName: e.target.value })} />
              <Input placeholder="Caller ID name" value={extForm.callerIdName} onChange={(e) => setExtForm({ ...extForm, callerIdName: e.target.value })} />
            </div>
          ) : null}

          {step === 2 ? (
            <div className="max-w-md space-y-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={deviceForm.skip} onChange={(e) => setDeviceForm({ ...deviceForm, skip: e.target.checked })} />
                Skip device (softphone only later)
              </label>
              {!deviceForm.skip ? (
                <>
                  <Input placeholder="MAC address" value={deviceForm.macAddress} onChange={(e) => setDeviceForm({ ...deviceForm, macAddress: e.target.value })} />
                  <Input placeholder="Model" value={deviceForm.model} onChange={(e) => setDeviceForm({ ...deviceForm, model: e.target.value })} />
                </>
              ) : null}
            </div>
          ) : null}

          {step === 3 ? (
            <div className="max-w-md space-y-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={didForm.skip} onChange={(e) => setDidForm({ ...didForm, skip: e.target.checked })} />
                Skip DID assignment
              </label>
              {!didForm.skip ? (
                <>
                  <select
                    className="h-10 w-full rounded-xl border border-border px-3 text-sm"
                    value={didForm.phoneNumberId}
                    onChange={(e) => setDidForm({ ...didForm, phoneNumberId: e.target.value })}
                  >
                    <option value="">Select unrouted number…</option>
                    {(didsQuery.data ?? [])
                      .filter((d) => !d.routed && !d.lineId)
                      .map((d) => (
                        <option key={String(d.id)} value={String(d.id)}>
                          {String(d.number)}
                        </option>
                      ))}
                  </select>
                  {selectedDid ? (
                    <Button variant="outline" size="sm" onClick={() => setDidDrawerOpen(true)}>
                      Configure routing
                    </Button>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}

          {step === 4 ? (
            <div className="max-w-md space-y-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={vmForm.enabled && !vmForm.skip}
                  onChange={(e) => setVmForm({ ...vmForm, enabled: e.target.checked, skip: !e.target.checked })}
                />
                Enable voicemail mailbox
              </label>
            </div>
          ) : null}

          {step === 5 ? (
            <div className="max-w-lg space-y-2 rounded-2xl border border-border p-4 text-sm">
              <p><strong>User:</strong> {userForm.firstName} {userForm.lastName} ({userForm.email})</p>
              <p><strong>Extension:</strong> {extForm.extension}</p>
              <p><strong>Device:</strong> {deviceForm.skip ? 'Skipped' : deviceForm.macAddress || 'Desk phone'}</p>
              <p><strong>DID:</strong> {didForm.skip ? 'Skipped' : selectedDid ? String(selectedDid.number) : 'None'}</p>
              <p><strong>Voicemail:</strong> {vmForm.skip || !vmForm.enabled ? 'Off' : 'On'}</p>
            </div>
          ) : null}

          {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

          <div className="mt-8 flex gap-2">
            {step > 0 ? (
              <Button variant="outline" onClick={back}>
                Back
              </Button>
            ) : null}
            <Button onClick={() => void next()} disabled={patch.isPending || commit.isPending || startSession.isPending}>
              {step === STEPS.length - 1 ? (commit.isPending ? 'Provisioning…' : 'Provision employee') : 'Next'}
            </Button>
          </div>

          <AssignDidDrawer
            open={didDrawerOpen}
            did={selectedDid as { id: string; number: string } | null}
            onClose={() => setDidDrawerOpen(false)}
            defaultCallerIdName={extForm.callerIdName || `${userForm.firstName} ${userForm.lastName}`.trim()}
          />
        </PageContainer>
      )}
    </ModuleAccessGate>
  );
}
