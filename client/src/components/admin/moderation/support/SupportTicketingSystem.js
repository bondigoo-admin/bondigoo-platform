import React, { useState } from 'react';
import TicketQueue from './TicketQueue';
import TicketDetailView from './TicketDetailView';
import { Sheet, SheetContent } from '../../../ui/sheet.jsx';

const SupportTicketingSystem = () => {
    const [selectedTicketId, setSelectedTicketId] = useState(null);

    const handleSheetOpenChange = (isOpen) => {
        if (!isOpen) {
            setSelectedTicketId(null);
        }
    };

    return (
        <div className="h-full flex flex-col">
            <TicketQueue 
                onTicketSelect={setSelectedTicketId} 
                selectedTicketId={selectedTicketId}
            />
            <Sheet open={!!selectedTicketId} onOpenChange={handleSheetOpenChange}>
                <SheetContent className="w-full sm:max-w-3xl lg:max-w-4xl xl:max-w-5xl p-0 flex flex-col">
                   {selectedTicketId && (
                     <TicketDetailView 
                        ticketId={selectedTicketId} 
                     />
                   )}
                </SheetContent>
            </Sheet>
        </div>
    );
};

export default SupportTicketingSystem;