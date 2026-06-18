import { Badge } from '@bmag-itam/client';

const wrap = { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' };

export const Variants = () => (
  <div style={wrap}>
    <Badge>Default</Badge>
    <Badge variant="secondary">Secondary</Badge>
    <Badge variant="success">Success</Badge>
    <Badge variant="warning">Warning</Badge>
    <Badge variant="destructive">Destructive</Badge>
    <Badge variant="muted">Muted</Badge>
    <Badge variant="outline">Outline</Badge>
  </div>
);

export const InContext = () => (
  <div style={wrap}>
    <Badge variant="success">Deployed</Badge>
    <Badge variant="muted">12 licenses</Badge>
    <Badge variant="warning">Expires in 14d</Badge>
  </div>
);
