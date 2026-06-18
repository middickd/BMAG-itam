import { Button } from '@bmag-itam/client';

const row = { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' };

export const Variants = () => (
  <div style={row}>
    <Button>Add asset</Button>
    <Button variant="secondary">Export</Button>
    <Button variant="outline">Filter</Button>
    <Button variant="destructive">Retire</Button>
    <Button variant="ghost">Cancel</Button>
    <Button variant="link">View history</Button>
  </div>
);

export const Sizes = () => (
  <div style={row}>
    <Button size="sm">Small</Button>
    <Button size="default">Default</Button>
    <Button size="lg">Large</Button>
  </div>
);

export const States = () => (
  <div style={row}>
    <Button>Enabled</Button>
    <Button disabled>Disabled</Button>
  </div>
);
