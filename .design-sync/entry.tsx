// Curated design-system entry for /design-sync.
// Re-exports exactly the in-scope components (and their compound sub-parts so
// preview cards can compose them) from the real app source. The converter
// bundles this into window.BMAGUI.*. Not imported by the app itself.
export { Button } from '@/components/ui/button';
export type { ButtonProps } from '@/components/ui/button';

export { Badge } from '@/components/ui/badge';
export type { BadgeProps } from '@/components/ui/badge';

export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';

export {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogClose,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

export { Input } from '@/components/ui/input';
export { Label } from '@/components/ui/label';

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';

export { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

export { StatusBadge } from '@/components/StatusBadge';
export { PageHeader } from '@/components/PageHeader';
export { Avatar } from '@/components/Avatar';
