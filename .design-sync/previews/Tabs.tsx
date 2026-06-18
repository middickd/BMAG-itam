import { Tabs, TabsList, TabsTrigger, TabsContent } from '@bmag-itam/client';

const body = { fontSize: 14, color: '#475569', marginTop: 8 };

export const AssetTabs = () => (
  <div style={{ width: 460, maxWidth: '100%' }}>
    <Tabs defaultValue="overview">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="history">History</TabsTrigger>
        <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        <p style={body}>Specs, assignment, and purchase details for this device.</p>
      </TabsContent>
      <TabsContent value="history">
        <p style={body}>Check-out and check-in history.</p>
      </TabsContent>
    </Tabs>
  </div>
);
