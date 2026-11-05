# backend/core/management/commands/seed_demo_data.py

from decimal import Decimal
from datetime import timedelta
import random

from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from restaurants.models import (
    Restaurant,
    Branch,
    MenuCategory,
    MenuItem,
)
from inventory.models import (
    Supplier,
    InventoryItem,
    StockLevel,
    Purchase,
    PurchaseItem,
    StockMovement,
    RecipeIngredient,
)
from customers.models import Customer
from staff.models import StaffMember
from orders.models import Order, OrderItem
from payments.models import Payment
from orders.services import complete_order


User = get_user_model()


class Command(BaseCommand):
    help = "Populate the existing restaurant with demonstration data."

    def add_arguments(self, parser):
        parser.add_argument(
            "--restaurant-id",
            type=int,
            default=None,
            help="ID of the restaurant to populate.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        random.seed(42)

        restaurant_id = options.get("restaurant_id")

        if restaurant_id:
            restaurant = Restaurant.objects.filter(
                pk=restaurant_id
            ).first()
        else:
            restaurant = Restaurant.objects.order_by("id").first()

        if not restaurant:
            raise CommandError("No restaurant was found.")

        branch = Branch.objects.filter(
            restaurant=restaurant,
            is_active=True,
        ).first()

        if not branch:
            raise CommandError(
                "No active branch was found for this restaurant."
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"Populating: {restaurant.name} / {branch.name}"
            )
        )

        self.create_categories(restaurant)
        menu_items = self.create_menu(restaurant, branch)
        suppliers = self.create_suppliers(restaurant)
        inventory_items = self.create_inventory(restaurant)
        self.create_purchases(
            restaurant,
            branch,
            suppliers,
            inventory_items,
        )
        self.create_recipes(menu_items, inventory_items)
        customers = self.create_customers(restaurant)
        self.create_staff(restaurant, branch)
        self.create_orders(
            restaurant,
            branch,
            menu_items,
            customers,
        )

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                "RestaurantOS demonstration data created successfully."
            )
        )

        self.print_summary(restaurant)

    # --------------------------------------------------
    # MENU CATEGORIES
    # --------------------------------------------------

    def create_categories(self, restaurant):
        categories = [
            ("Rice Dishes", "Our signature rice meals."),
            ("Swallow and Soups", "Traditional Nigerian meals."),
            ("Grills and Proteins", "Freshly prepared grilled meals."),
            ("Fast Food", "Quick and satisfying meals."),
            ("Breakfast", "Breakfast and light meals."),
            ("Small Chops", "Snacks and small bites."),
            ("Drinks", "Cold and refreshing beverages."),
            ("Desserts", "Sweet treats and desserts."),
        ]

        for index, (name, description) in enumerate(categories, 1):
            MenuCategory.objects.get_or_create(
                restaurant=restaurant,
                name=name,
                defaults={
                    "description": description,
                    "display_order": index,
                    "is_active": True,
                },
            )

        self.stdout.write("Menu categories ready.")

    # --------------------------------------------------
    # MENU ITEMS
    # --------------------------------------------------

    def create_menu(self, restaurant, branch):
        category_names = [
            "Rice Dishes",
            "Swallow and Soups",
            "Grills and Proteins",
            "Fast Food",
            "Breakfast",
            "Small Chops",
            "Drinks",
            "Desserts",
        ]

        categories = {
            category.name: category
            for category in MenuCategory.objects.filter(
                restaurant=restaurant,
                name__in=category_names,
            )
        }

        menu_data = [
            ("Jollof Rice", "Rice Dishes", 3500, 20),
            ("Fried Rice", "Rice Dishes", 4000, 20),
            ("White Rice and Stew", "Rice Dishes", 3000, 15),
            ("Coconut Rice", "Rice Dishes", 4500, 25),
            ("Ofada Rice and Sauce", "Rice Dishes", 5000, 30),
            ("Egusi Soup", "Swallow and Soups", 2500, 25),
            ("Vegetable Soup", "Swallow and Soups", 2500, 25),
            ("Okra Soup", "Swallow and Soups", 2000, 20),
            ("Pounded Yam", "Swallow and Soups", 1500, 15),
            ("Eba", "Swallow and Soups", 800, 10),
            ("Grilled Chicken", "Grills and Proteins", 4500, 30),
            ("Fried Chicken", "Grills and Proteins", 4000, 25),
            ("Beef Suya", "Grills and Proteins", 3500, 20),
            ("Pepper Soup", "Grills and Proteins", 4000, 30),
            ("Shawarma", "Fast Food", 3500, 15),
            ("Beef Burger", "Fast Food", 4000, 15),
            ("Bread and Tea", "Breakfast", 1800, 10),
            ("Moi Moi", "Breakfast", 1000, 15),
            ("Puff Puff", "Small Chops", 1000, 10),
            ("Spring Rolls", "Small Chops", 1500, 15),
            ("Fresh Orange Juice", "Drinks", 1800, 5),
            ("Chapman", "Drinks", 2000, 5),
            ("Bottled Water", "Drinks", 500, 2),
            ("Chocolate Cake", "Desserts", 2500, 10),
        ]

        result = {}

        for index, (name, category_name, price, prep_time) in enumerate(
            menu_data, 1
        ):
            category = categories[category_name]

            item, created = MenuItem.objects.get_or_create(
                restaurant=restaurant,
                name=name,
                defaults={
                    "category": category,
                    "description": (
                        f"Freshly prepared {name.lower()} "
                        "from The Local Plate kitchen."
                    ),
                    "price": Decimal(str(price)),
                    "preparation_time": prep_time,
                    "is_available": True,
                    "display_order": index,
                },
            )

            if created:
                item.branches.add(branch)

            result[name] = item

        self.stdout.write(
            self.style.SUCCESS(f"{len(result)} menu items ready.")
        )

        return result

    # --------------------------------------------------
    # SUPPLIERS
    # --------------------------------------------------

    def create_suppliers(self, restaurant):
        supplier_data = [
            ("Fresh Harvest Foods", "Grace Okafor", "08031110001"),
            ("Abuja Rice Merchants", "Ibrahim Musa", "08031110002"),
            ("Golden Oil Distributors", "Daniel James", "08031110003"),
            ("Prime Poultry Suppliers", "Mary Samuel", "08031110004"),
            ("Fresh Farm Produce", "Aisha Bello", "08031110005"),
            ("Premium Meat Centre", "John Peter", "08031110006"),
            ("Beverage World", "David Emmanuel", "08031110007"),
            ("Bakery Essentials", "Esther Paul", "08031110008"),
        ]

        suppliers = {}

        for name, contact, phone in supplier_data:
            supplier, _ = Supplier.objects.get_or_create(
                restaurant=restaurant,
                name=name,
                defaults={
                    "contact_person": contact,
                    "phone": phone,
                    "email": "",
                    "address": "Abuja, Nigeria",
                    "notes": "RestaurantOS demonstration supplier.",
                    "is_active": True,
                },
            )

            suppliers[name] = supplier

        self.stdout.write("Suppliers ready.")

        return suppliers

    # --------------------------------------------------
    # INVENTORY ITEMS
    # --------------------------------------------------

    def create_inventory(self, restaurant):
        inventory_data = [
            ("Long Grain Rice", "DEMO-RICE-001", "Grains", "kg", "10"),
            ("Vegetable Oil", "DEMO-OIL-001", "Oils", "litre", "5"),
            ("Tomatoes", "DEMO-TOM-001", "Vegetables", "kg", "5"),
            ("Fresh Pepper", "DEMO-PEP-001", "Vegetables", "kg", "3"),
            ("Onions", "DEMO-ONI-001", "Vegetables", "kg", "3"),
            ("Chicken", "DEMO-CHK-001", "Proteins", "kg", "5"),
            ("Beef", "DEMO-BEF-001", "Proteins", "kg", "5"),
            ("Beans", "DEMO-BEA-001", "Grains", "kg", "5"),
            ("Palm Oil", "DEMO-PAL-001", "Oils", "litre", "3"),
            ("Groundnut Oil", "DEMO-GRO-001", "Oils", "litre", "3"),
            ("Salt", "DEMO-SAL-001", "Seasoning", "kg", "1"),
            ("Seasoning Cubes", "DEMO-SEA-001", "Seasoning", "pack", "5"),
            ("Flour", "DEMO-FLO-001", "Baking", "kg", "5"),
            ("Sugar", "DEMO-SUG-001", "Baking", "kg", "3"),
            ("Milk", "DEMO-MIL-001", "Dairy", "litre", "3"),
        ]

        inventory = {}

        for name, sku, category, unit, reorder in inventory_data:
            item, _ = InventoryItem.objects.get_or_create(
                restaurant=restaurant,
                sku=sku,
                defaults={
                    "name": name,
                    "description": (
                        f"Demonstration inventory item: {name}"
                    ),
                    "category": category,
                    "unit": unit,
                    "reorder_level": Decimal(reorder),
                    "is_active": True,
                },
            )

            inventory[name] = item

        self.stdout.write(
            self.style.SUCCESS(
                f"{len(inventory)} inventory ingredients ready."
            )
        )

        return inventory

    # --------------------------------------------------
    # PURCHASES AND STOCK
    # --------------------------------------------------

    def create_purchases(
        self,
        restaurant,
        branch,
        suppliers,
        inventory,
    ):
        supplier = suppliers["Abuja Rice Merchants"]

        purchase_data = [
            ("Long Grain Rice", "100", "1800"),
            ("Vegetable Oil", "60", "2500"),
            ("Tomatoes", "80", "1200"),
            ("Fresh Pepper", "30", "1500"),
            ("Onions", "40", "1000"),
            ("Chicken", "60", "4500"),
            ("Beef", "50", "6000"),
            ("Beans", "40", "1800"),
            ("Palm Oil", "30", "3000"),
            ("Groundnut Oil", "30", "2800"),
            ("Salt", "15", "800"),
            ("Seasoning Cubes", "20", "1500"),
            ("Flour", "30", "1600"),
            ("Sugar", "20", "1700"),
            ("Milk", "40", "2200"),
        ]

        for index, (item_name, quantity, unit_cost) in enumerate(
            purchase_data, 1
        ):
            reference = f"DEMO-PUR-{index:03d}"

            purchase, created = Purchase.objects.get_or_create(
                restaurant=restaurant,
                reference=reference,
                defaults={
                    "supplier": supplier,
                    "branch": branch,
                    "status": "draft",
                    "purchase_date": timezone.localdate()
                    - timedelta(days=index),
                    "notes": "DEMO DATA - RestaurantOS demonstration.",
                    "created_by": restaurant.owner,
                },
            )

            item = inventory[item_name]

            if created:
                PurchaseItem.objects.create(
                    purchase=purchase,
                    inventory_item=item,
                    quantity=Decimal(quantity),
                    unit_cost=Decimal(unit_cost),
                )

            # Receive only newly created draft purchases.
            if created and purchase.status == "draft":
                purchase_item = purchase.items.get(
                    inventory_item=item
                )

                stock, _ = StockLevel.objects.get_or_create(
                    inventory_item=item,
                    branch=branch,
                    defaults={"quantity": Decimal("0.000")},
                )

                stock.quantity += purchase_item.quantity
                stock.save(update_fields=["quantity", "updated_at"])

                StockMovement.objects.get_or_create(
                    restaurant=restaurant,
                    inventory_item=item,
                    branch=branch,
                    movement_type="purchase",
                    reference=reference,
                    defaults={
                        "quantity": purchase_item.quantity,
                        "notes": "DEMO DATA - Received purchase.",
                        "created_by": restaurant.owner,
                    },
                )

                purchase.status = "received"
                purchase.save(
                    update_fields=["status", "updated_at"]
                )

        self.stdout.write(
            self.style.SUCCESS("Purchase records and stock ready.")
        )

    # --------------------------------------------------
    # RECIPES
    # --------------------------------------------------

    def create_recipes(self, menu_items, inventory):
        recipe_data = {
            "Jollof Rice": [
                ("Long Grain Rice", "0.250"),
                ("Vegetable Oil", "0.030"),
                ("Tomatoes", "0.100"),
                ("Fresh Pepper", "0.020"),
                ("Onions", "0.030"),
            ],
            "Fried Rice": [
                ("Long Grain Rice", "0.250"),
                ("Vegetable Oil", "0.030"),
                ("Carrots", "0.050"),
            ],
            "White Rice and Stew": [
                ("Long Grain Rice", "0.250"),
                ("Tomatoes", "0.100"),
                ("Vegetable Oil", "0.020"),
            ],
            "Grilled Chicken": [
                ("Chicken", "0.300"),
                ("Salt", "0.005"),
                ("Seasoning Cubes", "0.010"),
            ],
            "Fried Chicken": [
                ("Chicken", "0.300"),
                ("Groundnut Oil", "0.050"),
                ("Flour", "0.050"),
            ],
            "Beef Suya": [
                ("Beef", "0.200"),
                ("Fresh Pepper", "0.020"),
                ("Salt", "0.005"),
            ],
            "Moi Moi": [
                ("Beans", "0.200"),
                ("Vegetable Oil", "0.020"),
                ("Onions", "0.020"),
            ],
            "Puff Puff": [
                ("Flour", "0.150"),
                ("Sugar", "0.030"),
            ],
        }

        # Carrots are needed for fried rice.
        carrots, _ = InventoryItem.objects.get_or_create(
            restaurant=menu_items["Fried Rice"].restaurant,
            sku="DEMO-CAR-001",
            defaults={
                "name": "Carrots",
                "category": "Vegetables",
                "unit": "kg",
                "reorder_level": Decimal("2"),
                "description": "Demonstration inventory item.",
            },
        )

        # Add initial stock for carrots.
        StockLevel.objects.get_or_create(
            inventory_item=carrots,
            branch=menu_items["Fried Rice"].branches.first(),
            defaults={"quantity": Decimal("20.000")},
        )

        for menu_name, ingredients in recipe_data.items():
            menu_item = menu_items[menu_name]

            for ingredient_name, quantity in ingredients:
                ingredient = (
                    carrots
                    if ingredient_name == "Carrots"
                    else inventory[ingredient_name]
                )

                RecipeIngredient.objects.get_or_create(
                    menu_item=menu_item,
                    inventory_item=ingredient,
                    defaults={
                        "quantity": Decimal(quantity),
                        "notes": "DEMO DATA - Per serving.",
                    },
                )

        self.stdout.write("Recipe ingredients ready.")

    # --------------------------------------------------
    # CUSTOMERS
    # --------------------------------------------------

    def create_customers(self, restaurant):
        names = [
            "Amina Yusuf",
            "Daniel Okafor",
            "Grace Emmanuel",
            "Ibrahim Musa",
            "Chinedu James",
            "Mary Samuel",
            "Fatima Bello",
            "David Peter",
            "Esther Johnson",
            "Samuel Ade",
            "Ruth Michael",
            "Peter Ibrahim",
            "Joy Williams",
            "Michael Joseph",
            "Blessing David",
            "Abubakar Sani",
            "Hauwa Mohammed",
            "John Sunday",
            "Precious Paul",
            "Sarah Ahmed",
            "Emeka Obi",
            "Tunde Bakare",
            "Ngozi Eze",
            "Musa Abdullahi",
            "Victoria James",
            "Paul Daniel",
            "Hadiza Aliyu",
            "Josephine Okoro",
            "Kelechi Nwosu",
            "Yusuf Lawal",
        ]

        customers = []

        for index, name in enumerate(names, 1):
            phone = f"0803000{index:04d}"

            customer, _ = Customer.objects.get_or_create(
                restaurant=restaurant,
                phone=phone,
                defaults={
                    "full_name": name,
                    "email": "",
                    "address": "Abuja, Nigeria",
                    "notes": "DEMO DATA - Demonstration customer.",
                },
            )

            customers.append(customer)

        self.stdout.write(
            self.style.SUCCESS(
                f"{len(customers)} demonstration customers ready."
            )
        )

        return customers

    # --------------------------------------------------
    # STAFF
    # --------------------------------------------------

        # --------------------------------------------------
    # STAFF
    # --------------------------------------------------

    def create_staff(self, restaurant, branch):
        staff_data = [
            ("manager", "Restaurant Manager", "manager"),
            ("cashier", "Restaurant Cashier", "cashier"),
            ("waiter1", "Waiter One", "waiter"),
            ("waiter2", "Waiter Two", "waiter"),
            ("kitchen1", "Kitchen Staff One", "kitchen_staff"),
            ("kitchen2", "Kitchen Staff Two", "kitchen_staff"),
        ]

        for username, full_name, role in staff_data:
            email = f"demo.{username}@hashtag.example"

            user = User.objects.filter(email=email).first()

            if not user:
                name_parts = full_name.split(" ", 1)

                first_name = name_parts[0]
                last_name = (
                    name_parts[1] if len(name_parts) > 1 else ""
                )

                user = User.objects.create_user(
                    email=email,
                    password=None,
                    first_name=first_name,
                    last_name=last_name,
                    is_active=True,
                )

            staff, created = StaffMember.objects.get_or_create(
                user=user,
                defaults={
                    "restaurant": restaurant,
                    "role": role,
                    "phone": "08030009999",
                },
            )

            if staff.restaurant_id != restaurant.id:
                self.stdout.write(
                    self.style.WARNING(
                        f"Skipping {email}: already assigned "
                        "to another restaurant."
                    )
                )
                continue

            staff.role = role
            staff.phone = "08030009999"
            staff.save(update_fields=["role", "phone"])
            staff.branches.add(branch)

        self.stdout.write(
            self.style.SUCCESS("Demonstration staff profiles ready.")
        )

    # --------------------------------------------------
    # ORDERS AND PAYMENTS
    # --------------------------------------------------

    def create_orders(
        self,
        restaurant,
        branch,
        menu_items,
        customers,
    ):
        order_menu = [
            "Jollof Rice",
            "Fried Rice",
            "White Rice and Stew",
            "Grilled Chicken",
            "Fried Chicken",
            "Beef Suya",
            "Moi Moi",
            "Puff Puff",
        ]

        methods = ["cash", "pos", "bank_transfer", "card"]

        created_orders = 0

        for index in range(1, 31):
            order_number = f"DEMO-ORD-{index:04d}"

            order, created = Order.objects.get_or_create(
                restaurant=restaurant,
                order_number=order_number,
                defaults={
                    "branch": branch,
                    "customer": customers[(index - 1) % len(customers)],
                    "customer_name": customers[
                        (index - 1) % len(customers)
                    ].full_name,
                    "customer_phone": customers[
                        (index - 1) % len(customers)
                    ].phone,
                    "order_type": (
                        "dine_in" if index % 3 == 0
                        else "takeaway" if index % 3 == 1
                        else "delivery"
                    ),
                    "table_number": (
                        str((index % 15) + 1)
                        if index % 3 == 0
                        else ""
                    ),
                    "status": "pending",
                    "notes": "DEMO DATA - RestaurantOS demonstration.",
                    "created_by": restaurant.owner,
                },
            )

            if not created:
                continue

            selected_names = [
                order_menu[(index - 1) % len(order_menu)]
            ]

            if index % 4 == 0:
                selected_names.append("Jollof Rice")

            for menu_name in selected_names:
                menu_item = menu_items[menu_name]

                OrderItem.objects.create(
                    order=order,
                    menu_item=menu_item,
                    quantity=1,
                    unit_price=menu_item.price,
                )

            # First 15 orders are completed through the actual service.
            if index <= 15:
                complete_order(order.pk)

            elif index <= 22:
                order.status = "preparing"
                order.save(update_fields=["status", "updated_at"])

            elif index <= 26:
                order.status = "ready"
                order.save(update_fields=["status", "updated_at"])

            # Add payments to demonstration orders.
            total = order.subtotal

            if index % 5 == 0:
                amount = total / Decimal("2")
            elif index % 7 == 0:
                amount = total
            else:
                amount = total

            payment_reference = f"DEMO-PAY-{index:04d}"

            Payment.objects.get_or_create(
                order=order,
                reference=payment_reference,
                defaults={
                    "payment_method": methods[index % len(methods)],
                    "amount": amount,
                    "status": "completed",
                    "reference": payment_reference,
                    "notes": "DEMO DATA - Demonstration payment.",
                    "received_by": restaurant.owner,
                    "paid_at": timezone.now(),
                },
            )

            created_orders += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"{created_orders} new demonstration orders created."
            )
        )

    # --------------------------------------------------
    # SUMMARY
    # --------------------------------------------------

    def print_summary(self, restaurant):
        self.stdout.write("")
        self.stdout.write("========== DEMO DATA SUMMARY ==========")

        summary = [
            ("Menu categories", MenuCategory.objects.filter(
                restaurant=restaurant
            ).count()),
            ("Menu items", MenuItem.objects.filter(
                restaurant=restaurant
            ).count()),
            ("Suppliers", Supplier.objects.filter(
                restaurant=restaurant
            ).count()),
            ("Inventory items", InventoryItem.objects.filter(
                restaurant=restaurant
            ).count()),
            ("Customers", Customer.objects.filter(
                restaurant=restaurant
            ).count()),
            ("Staff", StaffMember.objects.filter(
                restaurant=restaurant
            ).count()),
            ("Orders", Order.objects.filter(
                restaurant=restaurant
            ).count()),
            ("Payments", Payment.objects.filter(
                order__restaurant=restaurant
            ).count()),
            ("Purchases", Purchase.objects.filter(
                restaurant=restaurant
            ).count()),
        ]

        for label, count in summary:
            self.stdout.write(f"{label}: {count}")

        self.stdout.write("=======================================")