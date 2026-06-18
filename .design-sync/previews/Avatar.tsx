import { Avatar } from '@bmag-itam/client';

const wrap = { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' };

export const Sizes = () => (
  <div style={wrap}>
    <Avatar name="Dana Whitfield" size={24} />
    <Avatar name="Dana Whitfield" size={32} />
    <Avatar name="Dana Whitfield" size={48} />
    <Avatar name="Dana Whitfield" size={64} />
  </div>
);

export const Colors = () => (
  <div style={wrap}>
    <Avatar name="Alex Rivera" color="#2563eb" />
    <Avatar name="Sam Patel" color="#16a34a" />
    <Avatar name="Jordan Kim" color="#db2777" />
    <Avatar name="Lee Cruz" color="#ea580c" />
    <Avatar name="Morgan Diaz" />
  </div>
);
