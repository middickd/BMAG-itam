import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@bmag-itam/client';

export const Triggers = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 280 }}>
    <Select>
      <SelectTrigger>
        <SelectValue placeholder="Select status" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="in_stock">In stock</SelectItem>
        <SelectItem value="deployed">Deployed</SelectItem>
        <SelectItem value="retired">Retired</SelectItem>
      </SelectContent>
    </Select>
    <Select defaultValue="okc">
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="okc">OKC HQ</SelectItem>
        <SelectItem value="tul">Tulsa</SelectItem>
      </SelectContent>
    </Select>
  </div>
);
