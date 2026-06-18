import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
} from '@bmag-itam/client';

export const RetireConfirm = () => (
  <Dialog open>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Retire this asset?</DialogTitle>
        <DialogDescription>
          MacBook Pro 16" (BMAG-04821) will be marked retired and unassigned from Dana Whitfield. You can restore it later from the archive.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline">Cancel</Button>
        <Button variant="destructive">Retire asset</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
