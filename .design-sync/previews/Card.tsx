import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Button,
} from '@bmag-itam/client';

const kv = { display: 'flex', justifyContent: 'space-between', fontSize: 14 };
const muted = { color: '#64748b' };

export const AssetCard = () => (
  <div style={{ maxWidth: 380 }}>
    <Card>
      <CardHeader>
        <CardTitle>MacBook Pro 16"</CardTitle>
        <CardDescription>Asset tag BMAG-04821 · Serial C02FK1XYZ</CardDescription>
      </CardHeader>
      <CardContent>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={kv}><span style={muted}>Assigned to</span><span>Dana Whitfield</span></div>
          <div style={kv}><span style={muted}>Location</span><span>OKC HQ — 3rd floor</span></div>
          <div style={kv}><span style={muted}>Purchased</span><span>Mar 12, 2024</span></div>
        </div>
      </CardContent>
      <CardFooter style={{ gap: 8 }}>
        <Button size="sm">View details</Button>
        <Button size="sm" variant="outline">Check in</Button>
      </CardFooter>
    </Card>
  </div>
);

export const StatCard = () => (
  <div style={{ maxWidth: 240 }}>
    <Card>
      <CardHeader>
        <CardDescription>Active assets</CardDescription>
        <CardTitle style={{ fontSize: 30 }}>1,284</CardTitle>
      </CardHeader>
      <CardContent>
        <span style={{ fontSize: 13, color: '#64748b' }}>+38 since last month</span>
      </CardContent>
    </Card>
  </div>
);
