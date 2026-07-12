'use client';

import { Input } from '../../ui/Input';

const MANUFACTURERS = ['GRANDSTREAM', 'YEALINK', 'FANVIL', 'POLY', 'CISCO', 'SNOM', 'OTHER'] as const;

export type DeviceModelForm = {
  name: string;
  manufacturer: string;
  model: string;
  modelFamily: string;
  macAddress: string;
  serialNumber: string;
  assetTag: string;
  location: string;
  transport: string;
  tlsEnabled: boolean;
  srtpEnabled: boolean;
  provUrl?: string;
  adminPassword?: string;
  firmwareChannel?: string;
  vlanId?: string;
  sidecar?: string;
};

export const emptyDeviceModelForm: DeviceModelForm = {
  name: '',
  manufacturer: 'GRANDSTREAM',
  model: '',
  modelFamily: '',
  macAddress: '',
  serialNumber: '',
  assetTag: '',
  location: '',
  transport: 'UDP',
  tlsEnabled: false,
  srtpEnabled: false,
  firmwareChannel: 'stable',
};

function ManufacturerFields({
  manufacturer,
  form,
  setForm,
}: {
  manufacturer: string;
  form: DeviceModelForm;
  setForm: (f: DeviceModelForm) => void;
}) {
  const m = manufacturer.toUpperCase();

  if (m === 'GRANDSTREAM') {
    return (
      <>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Model family</span>
          <Input
            value={form.modelFamily}
            onChange={(e) => setForm({ ...form, modelFamily: e.target.value })}
            placeholder="grp260x"
          />
        </label>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Firmware channel</span>
          <select
            className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
            value={form.firmwareChannel ?? 'stable'}
            onChange={(e) => setForm({ ...form, firmwareChannel: e.target.value })}
          >
            <option value="stable">Stable</option>
            <option value="beta">Beta</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.srtpEnabled} onChange={(e) => setForm({ ...form, srtpEnabled: e.target.checked })} />
          SRTP (recommended for GRP series)
        </label>
      </>
    );
  }

  if (m === 'YEALINK') {
    return (
      <>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Model family</span>
          <Input
            value={form.modelFamily}
            onChange={(e) => setForm({ ...form, modelFamily: e.target.value })}
            placeholder="t46u"
          />
        </label>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Sidecar / EXP module</span>
          <Input
            value={form.sidecar ?? ''}
            onChange={(e) => setForm({ ...form, sidecar: e.target.value })}
            placeholder="EXP50"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.tlsEnabled} onChange={(e) => setForm({ ...form, tlsEnabled: e.target.checked })} />
          TLS transport (SIP over TLS)
        </label>
      </>
    );
  }

  if (m === 'FANVIL') {
    return (
      <>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Model family</span>
          <Input
            value={form.modelFamily}
            onChange={(e) => setForm({ ...form, modelFamily: e.target.value })}
            placeholder="x4u"
          />
        </label>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">VLAN ID</span>
          <Input
            value={form.vlanId ?? ''}
            onChange={(e) => setForm({ ...form, vlanId: e.target.value })}
            placeholder="Optional voice VLAN"
          />
        </label>
      </>
    );
  }

  return (
    <label className="block space-y-1.5 text-sm">
      <span className="font-medium">Model family</span>
      <Input value={form.modelFamily} onChange={(e) => setForm({ ...form, modelFamily: e.target.value })} />
    </label>
  );
}

export function DeviceModelFields({
  form,
  setForm,
  deskPhone,
}: {
  form: DeviceModelForm;
  setForm: (f: DeviceModelForm) => void;
  deskPhone?: boolean;
}) {
  return (
    <div className="space-y-4">
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Device name</span>
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </label>
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Manufacturer</span>
        <select
          className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
          value={form.manufacturer}
          onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
        >
          {MANUFACTURERS.map((m) => (
            <option key={m} value={m}>
              {m.charAt(0) + m.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
      </label>
      {deskPhone ? (
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">MAC address</span>
          <Input
            value={form.macAddress}
            onChange={(e) => setForm({ ...form, macAddress: e.target.value })}
            placeholder="AA:BB:CC:DD:EE:FF"
            className="font-mono"
          />
        </label>
      ) : null}
      <ManufacturerFields manufacturer={form.manufacturer} form={form} setForm={setForm} />
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Model</span>
        <Input
          value={form.model}
          onChange={(e) => setForm({ ...form, model: e.target.value })}
          placeholder={
            form.manufacturer === 'GRANDSTREAM'
              ? 'GRP2601'
              : form.manufacturer === 'YEALINK'
                ? 'T46U'
                : form.manufacturer === 'FANVIL'
                  ? 'X4U'
                  : ''
          }
        />
      </label>
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Serial number</span>
        <Input value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} />
      </label>
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Location</span>
        <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
      </label>
      {deskPhone ? (
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Transport</span>
          <select
            className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
            value={form.transport}
            onChange={(e) => setForm({ ...form, transport: e.target.value })}
          >
            <option value="UDP">UDP</option>
            <option value="TCP">TCP</option>
            <option value="TLS">TLS</option>
          </select>
        </label>
      ) : null}
    </div>
  );
}
