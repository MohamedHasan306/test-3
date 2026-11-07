// async create(userId: string, dto: CreateOrderDto): Promise<Order> {
//   const failAfter = (seconds: number) =>
//     new Promise<never>((_, reject) =>
//       setTimeout(
//         () =>
//           reject(
//             new RequestTimeoutException(
//               'The request took too long to process, Please try again later.',
//             ),
//           ),
//         seconds * 1000,
//       ),
//     );
//   const delayFor = (seconds: number) =>
//     new Promise((resolve) => setTimeout(resolve, seconds * 1000));

//   const createdOrder = await Promise.race([
//     this.dataSource.transaction(async (manager) => {
//       const productRepository = manager.getRepository(Product);
//       const orderItems: OrderItem[] = [];
//       let totalPrice = 0;

//       for (const line of dto.items) {
//         const product = await productRepository.findOne({
//           where: { id: line.productId },
//           relations: { warehouse: true },
//         });
//         if (!product)
//           throw new BadRequestException(
//             `Product ${line.productId} does not exist`,
//           );

//         const productWarehouse = product.warehouse;
//         if (!productWarehouse)
//           throw new BadRequestException(
//             `Product ${line.productId} does not have warehouse stock data`,
//           );

//         if (productWarehouse.quantity < line.quantity)
//           throw new BadRequestException(
//             `The requested quantity of product ${line.productId} is not available, order hasn't been done`,
//           );

//         const currentVersion = productWarehouse.version;
//         const newQuantity = productWarehouse.quantity - line.quantity;

//         // Testing the optimistic locking
//         if (userId === '742cc46a-8e52-4495-9a51-e30682ca8aff')
//           await delayFor(10);

//         const updatedRecordsCount = await this.warehouseService.update(
//           productWarehouse.id,
//           currentVersion,
//           newQuantity,
//           manager,
//         );

//         if (updatedRecordsCount === 0)
//           throw new ConflictException(
//             `The product ${line.productId} was modified by another request, Please try again.`,
//           );

//         const unitPrice = Number(product.price);
//         totalPrice += unitPrice * line.quantity;

//         const orderItem = manager.getRepository(OrderItem).create({
//           productId: product.id,
//           quantity: line.quantity,
//           unitPrice: product.price,
//         });
//         orderItems.push(orderItem);
//       }

//       const order = manager.getRepository(Order).create({
//         userId,
//         status: OrderStatus.PENDING,
//         totalPrice: totalPrice.toFixed(2),
//         items: orderItems,
//       });

//       // await delayFor(10); // Simulate a delay for testing the timeout
//       const saved = await manager.getRepository(Order).save(order);

//       return saved;
//     }),
//     failAfter(5), // Set a timeout of 5 seconds for the transaction
//   ]);
//   await this.notificationsService.create(
//     userId,
//     `Your order #${createdOrder.id} has been created.`,
//   );
//   return createdOrder;
// }
