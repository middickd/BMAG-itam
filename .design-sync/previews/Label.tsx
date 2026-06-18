import { Label, Input } from '@bmag-itam/client';

const field = { display: 'flex', flexDirection: 'column', gap: 6 };

export const Field = () => (
  <div style={{ ...field, maxWidth: 320 }}>
    <Label htmlFor="serial">Serial number</Label>
    <Input id="serial" placeholder="C02FK1XYZ" />
  </div>
);

export const FieldGroup = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 320 }}>
    <div style={field}>
      <Label htmlFor="tag">Asset tag</Label>
      <Input id="tag" defaultValue="BMAG-04821" />
    </div>
    <div style={field}>
      <Label htmlFor="loc">Location</Label>
      <Input id="loc" placeholder="OKC HQ — 3rd floor" />
    </div>
  </div>
);
