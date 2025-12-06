import { SubscriptionType } from "../dto/subscriptions.dto";

export const plans = [
    {
        id: '873ad1c7-42ee-4e75-b813-77178070aa43',
        name: 'Trail',
        description: 'Trail Plan For Our Organization',
        interval: 'monthly',
        seatPriceCents: 25_00,
        maxSeats: 0,
        purchasable: true,
        type: SubscriptionType.PLAN
    },
    {
        id: '91111ea2-26a5-4b12-b3c1-5dcb7c5e3640',
        name: 'Enterpise',
        description: "Base Plan For Our Organization",
        interval: 'monthly',
        seatPriceCents: 25_00,
        maxSeats: 100,
        purchasable: true,
        type: SubscriptionType.PLAN
    },
    {
        id: 'f80c18fe-ab37-4cef-8b6f-a9fae5e64f58',
        name: 'Addon',
        description: 'COMING SOON',
        interval: 'Till Current Plan Ends',
        seatPriceCents: 25_00,
        maxSeats: 100,
        purchasable: true,
        type: SubscriptionType.ADDON
    }
]