import { Input } from '@bmag-itam/client';

const col = { display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 320 };

export const Variants = () => (
  <div style={col}>
    <Input placeholder="Search assets…" />
    <Input defaultValue="BMAG-04821" />
    <Input type="email" placeholder="name@bobmoore.com" />
    <Input placeholder="Disabled" disabled />
  </div>
);
