// import { Badge } from '@/components/ui/badge';
// import { Button } from '@/components/ui/button';
// import {
//   Table,
//   TableBody,
//   TableCell,
//   TableHead,

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Package,
  Truck,
  XCircle,
  Star,
  ShoppingCart
} from 'lucide-react';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

// Define order status colors and icons
const STATUS_CONFIG = {
  pending: {
    color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    icon: Clock,
    label: 'Cash on Delivery'
  },
  paid: {
    color: 'bg-green-100 text-green-800 border-green-200',
    icon: CheckCircle,
    label: 'Paid'
  },
  shipped: {
    color: 'bg-blue-100 text-blue-800 border-blue-200',
    icon: Truck,
    label: 'Shipped'
  },
  delivered: {
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    icon: Package,
    label: 'Delivered'
  },
  done: {
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    icon: Package,
    label: 'Delivered'
  },
  failed: {
    color: 'bg-red-100 text-red-800 border-red-200',
    icon: XCircle,
    label: 'Failed'
  }
};

// Payment method labels
const PAYMENT_METHODS = {
  cod: 'Cash on Delivery',
  online: 'Online Payment',
  card: 'Card Payment',
  upi: 'UPI Payment',
  wallet: 'Wallet Payment'
};

interface OrderItem {
  id: string;
  product_id: string;
  quantity: number;
  price: number;
  products?: {
    title: string;
    image?: string;
  };
}

interface Order {
  id: string;
  order_number: string;
  total: number;
  status: string;
  created_at: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  payment_method: string;
  delivery_otp: string | null;
  order_items: OrderItem[];
}

const Orders: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
const { toast } = useToast();
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [selectedOtp, setSelectedOtp] = useState<string | null>(null);
  const [showOtpModal, setShowOtpModal] = useState(false);
  
  // Review control states
  const [reviewOrderId, setReviewOrderId] = useState<string | null>(null);
  const [rating, setRating] = useState<number>(5);
  const [comment, setComment] = useState<string>('');

  const handleShowOtp = (otp: string) => {
    setSelectedOtp(otp);
    setShowOtpModal(true);
  };

  const toggleOrderExpansion = (orderId: string) => {
    setExpandedOrders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) {
        newSet.delete(orderId);
      } else {
        newSet.add(orderId);
      }
      return newSet;
    });
  };

  // Fetch user's orders
  const { data: userOrders, isLoading, error } = useQuery<Order[], Error>({
    queryKey: ['orders', user?.id],
    queryFn: async (): Promise<Order[]> => {
      if (!user) return [];
      try {
        const { data, error } = await supabase
          .from('orders')
          .select(`
            id, 
            order_number,
            total, 
            status, 
            created_at,
            name,
            email,
            phone,
            address,
            city,
            state,
            zip_code,
            payment_method,
            delivery_otp,
            order_items (
              id, 
              product_id, 
              quantity, 
              price,
              products (
                title,
                image
              )
            )
          `)
          .eq('user_id', user?.id)
          .order('created_at', { ascending: false });

        if (error) {
          const { data: fallbackData, error: fallbackError } = await supabase
            .from('orders')
            .select(`
              id, 
              order_number,
              total, 
              status, 
              created_at,
              name,
              email,
              phone,
              address,
              city,
              state,
              zip_code,
              payment_method,
              delivery_otp,
              order_items (
                id, 
                product_id, 
                quantity, 
                price
              )
            `)
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

          if (fallbackError) throw fallbackError;
          return (fallbackData || []) as unknown as Order[];
        }
        return (data || []) as unknown as Order[];
      } catch (err) {
        console.error('Query error:', err);
        throw err;
      }
    },
    enabled: !!user
  });

  const submitOrderReview = async () => {
    if (!user || !reviewOrderId) return;
    try {
      const selectedOrder = userOrders?.find(o => o.id === reviewOrderId);
      const targetProductId = selectedOrder?.order_items[0]?.product_id || '';

      const { error } = await supabase
        .from('reviews')
        .insert({
          user_id: user.id,
          product_id: targetProductId,
          rating: rating,
          comment: comment,
          created_at: new Date().toISOString()
        });

      if (error) throw error;
      alert("Order review submitted successfully!");
      setReviewOrderId(null);
      setComment('');
    } catch (err) {
      console.error(err);
      alert("Failed to submit review.");
    }
  };
  const reorderMutation = useMutation({
  mutationFn: async (order: Order) => {
    if (!user) throw new Error("Login required");

    for (const item of order.order_items) {

      const { data: existing } = await supabase
        .from("cart_items")
        .select("*")
        .eq("user_id", user.id)
        .eq("product_id", item.product_id)
        .maybeSingle();

      if (existing) {

        await supabase
          .from("cart_items")
          .update({
            quantity: existing.quantity + item.quantity,
            updated_at: new Date().toISOString()
          })
          .eq("id", existing.id);

      } else {

        await supabase
          .from("cart_items")
          .insert({
            user_id: user.id,
            product_id: item.product_id,
            quantity: item.quantity
          });

      }
    }
  },

  onSuccess: () => {

    queryClient.invalidateQueries({
      queryKey: ["cart"]
    });

    toast({
      title: "Reordered Successfully",
      description: "Products added to cart."
    });

     navigate("/cart");
  },

  onError: (error: any) => {

    toast({
      title: "Error",
      description: error.message,
      variant: "destructive"
    });

  }
});

  // Fetch product details separately if needed
  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, title, image');
      if (error) return [];
      return data || [];
    },
    enabled: !!userOrders && userOrders.length > 0
  });

  const productMap = React.useMemo(() => {
    if (!products) return {};
    return products.reduce((acc, product) => {
      acc[product.id] = product;
      return acc;
    }, {} as Record<string, any>);
  }, [products]);

  if (isLoading) {
    return (
      <div className="pt-28 pb-20 section-container flex justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your orders...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pt-28 pb-20 section-container flex justify-center">
        <div className="text-center">
          <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-red-600 mb-4">Unable to load orders</p>
        </div>
      </div>
    );
  }

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="pt-16 pb-20 bg-gray-50 min-h-screen"
    >
      <div className="section-container">
        <div className="mb-4">
          <h1 className="text-3xl font-display font-bold text-gray-900 mb-1">My Orders</h1>
          <p className="text-gray-600 text-base">Track and manage your orders</p>
        </div>

        <div className="space-y-4">
          {userOrders?.map((order) => {
            const orderDate = new Date(order?.created_at);
            const totalItems = order?.order_items?.reduce((sum, item) => sum + item.quantity, 0) || 0;
            const statusConfig = STATUS_CONFIG[order?.status] || STATUS_CONFIG.pending;
            const StatusIcon = statusConfig.icon;
            const isExpanded = expandedOrders.has(order?.id);
            
            const isOrderComplete = order.status === 'delivered' || order.status === 'done';

            return (
              <Card key={order?.id} className="w-full shadow-sm border-gray-500 hover:shadow-md transition-shadow hover:border-gray-900 hover:bg-gray-300">
                <CardHeader className="pb-4">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="mb-2">
                        <div className="mb-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2 text-left">
                          <div className="flex flex-col items-start">
                            <CardTitle className="text-lg font-semibold">
                              Order #{order?.order_number || order?.id.slice(0, 8).toUpperCase()}
                            </CardTitle>
                            <div className="sm:hidden mt-1">
                              <Badge className={`${statusConfig.color} border font-medium w-fit`}>
                                <StatusIcon className="h-3 w-3 mr-1" />
                                {statusConfig.label}
                              </Badge>
                            </div>
                          </div>
                          <div className="hidden sm:block">
                            <Badge className={`${statusConfig.color} border font-medium w-fit`}>
                              <StatusIcon className="h-3 w-3 mr-1" />
                              {statusConfig.label}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                        <span>Placed on {orderDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        <span>•</span>
                        <span>{totalItems} item{totalItems !== 1 ? 's' : ''}</span>
                        <span>•</span>
                        <span className="font-medium text-gray-900">₹{order?.total.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2 ml-4">
                      {!isOrderComplete && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => order.delivery_otp && handleShowOtp(order.delivery_otp)}
                          disabled={!order.delivery_otp}
                          className={`min-w-[110px] rounded-md text-xs sm:text-sm transition-all ${order.delivery_otp ? 'border-red-500 bg-red-50 text-red-700 hover:bg-red-100' : 'border-slate-300 bg-slate-100 text-slate-500 cursor-not-allowed'}`}
                        >
                          {order.delivery_otp ? 'View OTP' : 'OTP pending'}
                        </Button>
                      )}
                      <Button
    size="sm"
    className="bg-green-600 hover:bg-green-700 text-white"
    onClick={() => reorderMutation.mutate(order)}
>
    <ShoppingCart className="w-4 h-4 mr-2" />
    Reorder
</Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleOrderExpansion(order?.id)}
                        className="flex items-center gap-1 text-gray-600 hover:text-gray-900 text-xs sm:text-sm"
                      >
                        {isExpanded ? (<><ChevronUp className="h-4 w-4" />Less Details</>) : (<><ChevronDown className="h-4 w-4" />More Details</>)}
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-0">
                  <div className="w-full border rounded-lg bg-white shadow-sm px-4 py-3 sm:px-6 sm:py-4">
                    <div className="hidden sm:block bg-gray-50 px-4 py-3 border-b rounded-t-lg">
                      <div className="grid grid-cols-4 gap-4 text-sm font-semibold text-gray-700">
                        <span>Product</span>
                        <span>Qty</span>
                        <span>Each Price</span>
                        <span className="text-right">Total</span>
                      </div>
                    </div>
                    
                    <div className="space-y-4 sm:space-y-0 sm:divide-y sm:divide-gray-100">
                      {order?.order_items?.map((item) => {
                        const productInfo = item.products || productMap[item.product_id];
                        return (
                          <div key={item.id} className="pt-3 sm:py-4 flex flex-col w-full bg-gray-50 sm:bg-transparent rounded-xl p-3 sm:p-0">
                            <div className="flex flex-col sm:grid sm:grid-cols-4 gap-2 sm:gap-4 items-start sm:items-center w-full">
                              <div className="flex items-center space-x-3">
                                {productInfo?.image && (
                                  <img src={productInfo.image} alt={productInfo.title} className="w-12 h-12 object-cover rounded-md border" />
                                )}
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium text-gray-900 truncate text-sm sm:text-base">{productInfo?.title || `Product ${item.product_id.slice(0, 8)}`}</p>
                                  <p className="text-xs text-gray-500">ID: {item.product_id.slice(0, 8)}...</p>
                                </div>
                              </div>
                              <div className="hidden sm:flex font-medium">{item.quantity}</div>
                              <div className="hidden sm:flex font-medium">₹{item.price.toFixed(2)}</div>
                              <div className="hidden sm:flex justify-end font-semibold text-base text-right">₹{(item.quantity * item.price).toFixed(2)}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    
                    {isOrderComplete && (
                      <div className="mt-4 pt-3 border-t border-dashed border-gray-200 flex justify-end w-full">
                        <Button 
                          size="sm" 
                          onClick={() => setReviewOrderId(order.id)}
                          className="bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-sm transition-all border border-amber-600/20"
                        >
                          <Star className="w-3.5 h-3.5 fill-current text-amber-100" /> Rate Order & Delivery Experience
                        </Button>
                      </div>
                    )}
                  </div>

                  {isExpanded && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-6 pt-6 border-t border-gray-200">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-gray-50 p-4 rounded-lg">
                          <h3 className="font-semibold mb-3 flex items-center gap-2"><div className="w-2 h-2 bg-blue-500 rounded-full"></div>Customer Info</h3>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between"><span className="text-gray-600">Name:</span><span className="font-medium">{order?.name || 'Not provided'}</span></div>
                            <div className="flex justify-between"><span className="text-gray-600">Email:</span><span className="font-medium">{order?.email || 'Not provided'}</span></div>
                            <div className="flex justify-between"><span className="text-gray-600">Phone:</span><span className="font-medium">{order.phone || 'Not provided'}</span></div>
                          </div>
                        </div>
                        <div className="bg-gray-50 p-4 rounded-lg">
                          <h3 className="font-semibold mb-3 flex items-center gap-2"><div className="w-2 h-2 bg-green-500 rounded-full"></div>Delivery Address</h3>
                          <div className="text-sm">
                            {order.address ? <p className="font-medium">{order.address}, {order.city}, {order.state}</p> : <p className="text-gray-500 italic">No address provided</p>}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* OTP Modal */}
      <Dialog open={showOtpModal} onOpenChange={setShowOtpModal}>
        <DialogContent className="sm:max-w-md w-full rounded-2xl bg-white p-6 shadow-xl">
          <DialogHeader><DialogTitle>Delivery OTP</DialogTitle></DialogHeader>
          <div className="text-center space-y-4 py-2">
            <p className="text-sm text-gray-600">Share this code with the delivery partner:</p>
            <div className="mx-auto inline-flex items-center justify-center rounded-3xl bg-blue-50 px-6 py-4 text-4xl font-semibold tracking-widest text-blue-700 shadow-sm">{selectedOtp}</div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Review Dialog Form */}
      <Dialog open={!!reviewOrderId} onOpenChange={(open) => !open && setReviewOrderId(null)}>
        <DialogContent className="sm:max-w-md w-full rounded-2xl bg-white p-6 shadow-xl">
          <DialogHeader><DialogTitle className="text-lg font-bold">Rate Order Experience</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rating</label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star 
                    key={star} 
                    onClick={() => setRating(star)} 
                    className={`w-7 h-7 cursor-pointer transition-colors ${star <= rating ? 'text-amber-400 fill-amber-400' : 'text-gray-300'}`} 
                  />
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Feedback Comments</label>
              <textarea 
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="How was the overall delivery timeline and service quality?"
                className="w-full border p-2.5 rounded-lg text-sm bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none h-24 resize-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setReviewOrderId(null)}>Cancel</Button>
              <Button onClick={submitOrderReview} className="bg-amber-500 hover:bg-amber-600 text-white">Submit Feedback</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </motion.main>
  );
};

export default Orders;