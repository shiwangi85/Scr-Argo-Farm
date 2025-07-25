import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Product } from '@/types/products';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CategoryScale, Chart as ChartJS, Legend, LinearScale, LineElement, PointElement, Title, Tooltip } from 'chart.js';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { AlertTriangle, ChevronDown, ChevronUp, Package, Pencil, Plus, SaveIcon, Trash2, X , Minus } from 'lucide-react';

import React, { useMemo, useState } from 'react';
import { Line } from 'react-chartjs-2';

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Search } from 'lucide-react';


// Initialize Chart.js
ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend
);

interface Order {
  id: string;
  created_at: string;
  status: string;
  total: number;
  user_id: string;
  updated_at: string;
  order_number?: string;
  payment_method?: string;
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  delivery_address?: string;
  delivery_city?: string;
  delivery_state?: string;
  delivery_zip_code?: string;
  payment_id?: string;
  payment_order_id?: string;
  payment_signature?: string;
  admin_visible?: boolean;
  cancelled_at?: string;
  cancellation_reason?: string;
  cancelled_by?: string;
  profiles?: {
    name?: string;
    email?: string;
  };
  order_items?: Array<{
    id: string;
    quantity: number;
    price: number;
    products?: {
      title: string;
      price: string;
      image: string;
    };
  }>;
}

interface Profile {
  id: string;
  email: string;
  created_at: string;
  updated_at: string;
  name?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
}

interface ProductWithStock extends Product {
  stock_quantity: number;
  min_stock_level: number;
  max_stock_level: number;
  stock_status: 'in_stock' | 'low_stock' | 'out_of_stock';
}

const Admin: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [editingProduct, setEditingProduct] = useState<ProductWithStock | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [stockUpdateProduct, setStockUpdateProduct] = useState<ProductWithStock | null>(null);
  const [stockUpdateQuantity, setStockUpdateQuantity] = useState<number>(0);
  const [newProduct, setNewProduct] = useState<Partial<ProductWithStock>>({
    title: '', image: '', price: '', unit: '', description: '', full_description: '', ingredients: '', usage_instructions: '', stock_quantity: 0, min_stock_level: 10, max_stock_level: 100
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
const [sortBy, setSortBy] = useState('date_desc');
const [activeMobileTab, setActiveMobileTab] = useState<'manage' | 'manage'>('manage');
const [productSearch, setProductSearch] = useState('');

  // Fetch products with stock information
  const { data: products = [], isLoading: productsLoading, error: productsError } = useQuery<ProductWithStock[]>({
    queryKey: ['admin-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*, stock_quantity, min_stock_level, max_stock_level')
        .order('created_at', { ascending: false });

      if (error) throw error;

      return data.map(product => ({
        ...product,
        stock_status: product.stock_quantity <= 0 ? 'out_of_stock' :
          product.stock_quantity <= (product.min_stock_level || 10) ? 'low_stock' :
            'in_stock'
      })) as ProductWithStock[];
    },
  });

  const [confirmOpen, setConfirmOpen] = useState(false);
const [productToDelete, setProductToDelete] = useState<string | null>(null);

const handleDeleteClick = (id: string) => {
  setProductToDelete(id);
  setConfirmOpen(true);
};

const handleConfirmDelete = () => {
  if (productToDelete) {
    deleteProduct.mutate(productToDelete);
    setConfirmOpen(false);
    setProductToDelete(null);
  }
};


  // Fetch orders with proper error handling
  const { data: orders = [], isLoading: ordersLoading, error: ordersError } = useQuery<Order[]>({
    queryKey: ['admin-orders'],
    queryFn: async () => {
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (ordersError) throw ordersError;

      const userIds = [...new Set(ordersData.map(order => order.user_id))];
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, name, email')
        .in('id', userIds);

      const ordersWithProfiles = ordersData.map(order => ({
        ...order,
        profiles: profilesData?.find(profile => profile.id === order.user_id)
      }));






      const ordersWithItems = await Promise.all(
        (ordersWithProfiles || []).map(async (order) => {
          const { data: itemsData, error: itemsError } = await supabase
            .from('order_items')
            .select(`
              *,
              products (
                title, price, image
              )
            `)
            .eq('order_id', order.id);

          return {
            ...order,
            order_items: itemsData || []
          };
        })
      );

      return ordersWithItems as Order[];
    },
    retry: 3,
    retryDelay: 1000,
  });

  // Calculate order statistics
  const orderStats = useMemo(() => {
    if (!orders || orders.length === 0) {
      return {
        totalOrders: 0,
        totalRevenue: 0,
        averageOrderValue: 0,
        statusCounts: {}
      };
    }

    const visibleOrders = orders.filter(order => order.admin_visible !== false);

    return {
      totalOrders: visibleOrders.length,
      totalRevenue: visibleOrders.reduce((sum, order) => sum + (order.total || 0), 0),
      averageOrderValue: visibleOrders.length > 0 ?
        visibleOrders.reduce((sum, order) => sum + (order.total || 0), 0) / visibleOrders.length : 0,
      statusCounts: visibleOrders.reduce((counts, order) => {
        counts[order.status] = (counts[order.status] || 0) + 1;
        return counts;
      }, {} as Record<string, number>)
    };
  }, [orders]);

  // Fetch profiles
  const { data: profiles = [], isLoading: profilesLoading } = useQuery<Profile[]>({
    queryKey: ['admin-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Profile[];
    },
  });
 const filteredProfiles = useMemo(() => {
    if (!profiles || profiles.length === 0) return [];
    
    return profiles.filter(profile => 
      profile.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      profile.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      profile.id.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [profiles, searchTerm]);

  // Create product mutation with stock
  const createProduct = useMutation({
    mutationFn: async (product: Partial<ProductWithStock>) => {
      const { data, error } = await supabase
        .from('products')
        .insert([{
          ...product,
          stock_quantity: product.stock_quantity || 0,
          min_stock_level: product.min_stock_level || 10,
          max_stock_level: product.max_stock_level || 100
        }])
        .select();

      if (error) throw error;
      return data[0];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast({
        title: "Product added",
        description: "The product has been added successfully with stock information."
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "There was a problem adding the product.",
        variant: "destructive"
      });
    }
  });

  // Update product mutation
  const updateProduct = useMutation({
    mutationFn: async (product: ProductWithStock) => {
      const updateFields = {
        title: product.title, image: product.image, price: product.price, unit: product.unit,
        description: product.description, full_description: product.full_description, ingredients: product.ingredients, usage_instructions: product.usage_instructions, stock_quantity: product.stock_quantity, min_stock_level: product.min_stock_level, max_stock_level: product.max_stock_level, updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('products')
        .update(updateFields)
        .eq('id', product.id)
        .select();

      if (error) throw error;
      return data[0];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast({
        title: "Product updated",
        description: "The product has been updated successfully."
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `There was a problem updating the product: ${error.message}`,
        variant: "destructive"
      });
    }
  });


//  product filter 
        const filteredProducts = useMemo(() => {
  if (!searchTerm) return products;
  
  return products.filter(product => 
    product.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.unit.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (product.description && product.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );
}, [products, searchTerm]);





  // Update stock mutation
  const updateStock = useMutation({
    mutationFn: async ({ productId, newQuantity, operation }: { productId: string, newQuantity: number, operation: 'add' | 'subtract' | 'set' }) => {
      const { data: currentProduct, error: fetchError } = await supabase
        .from('products')
        .select('stock_quantity')
        .eq('id', productId)
        .single();

      if (fetchError) throw fetchError;

      let finalQuantity = newQuantity;
      if (operation === 'add') {
        finalQuantity = currentProduct.stock_quantity + newQuantity;
      } else if (operation === 'subtract') {
        finalQuantity = Math.max(0, currentProduct.stock_quantity - newQuantity);
      }

      const { data, error } = await supabase
        .from('products')
        .update({
          stock_quantity: finalQuantity,
          updated_at: new Date().toISOString()
        })
        .eq('id', productId)
        .select();

      if (error) throw error;
      return data[0];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast({
        title: "Stock updated",
        description: `Stock has been updated successfully.`
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "There was a problem updating the stock.",
        variant: "destructive"
      });
    }
  });

  // Delete product mutation
  const deleteProduct = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast({
        title: "Product deleted",
        description: "The product has been removed successfully."
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "There was a problem deleting the product.",
        variant: "destructive"
      });
    }
  });

  // Stock management functions
  const handleStockUpdate = (product: ProductWithStock) => {
    setStockUpdateProduct(product);
    setStockUpdateQuantity(0);
  };

  const handleStockSave = (operation: 'add' | 'subtract' | 'set' | 'add10', productArg?: ProductWithStock) => {
    const productToUpdate = productArg || stockUpdateProduct;
    if (!productToUpdate) return;

    let quantity = stockUpdateQuantity;
    let op = operation;
    if (operation === 'add10') {
      quantity = 10;
      op = 'add';
    }

    updateStock.mutate({
      productId: productToUpdate.id,
      newQuantity: quantity,
      operation: op as 'add' | 'subtract' | 'set'
    }, {
      onSuccess: () => {
        setStockUpdateProduct(null);
        setStockUpdateQuantity(0);
      }
    });
  };

  // Get stock status color
  const getStockStatusColor = (status: string) => {
    switch (status) {
      case 'out_of_stock': return 'bg-red-100 text-red-800';
      case 'low_stock': return 'bg-yellow-100 text-yellow-800';
      case 'in_stock': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Get low stock products
  const lowStockProducts = products.filter(product =>
    product.stock_status === 'low_stock' || product.stock_status === 'out_of_stock'
  );

  // Edit a product
  const handleEdit = (product: ProductWithStock) => {
    const productCopy = {
      ...product,
      full_description: product.full_description || '',
      ingredients: product.ingredients || '',
      usage_instructions: product.usage_instructions || '',
      stock_quantity: product.stock_quantity || 0,
      min_stock_level: product.min_stock_level || 10,
      max_stock_level: product.max_stock_level || 100
    };

    setEditingProduct(productCopy);
    setIsAddingNew(false);
  };

  // Update product in edit mode
  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!editingProduct) return;

    const { name, value, type } = e.target;
    let processedValue: any = value;

    if (type === 'number') {
      processedValue = value === '' ? 0 : parseFloat(value) || 0;
    }

    setEditingProduct(prev => ({
      ...prev!,
      [name]: processedValue
    }));
  };

  // Save edited product
  const handleSaveEdit = () => {
    if (!editingProduct) return;

    if (!editingProduct.title || !editingProduct.price || !editingProduct.unit) {
      toast({
        title: "Validation Error",
        description: "Title, price, and unit are required fields.",
        variant: "destructive"
      });
      return;
    }

    updateProduct.mutate(editingProduct, {
      onSuccess: () => {
        setEditingProduct(null);
      }
    });
  };

  // Cancel edit
  const handleCancelEdit = () => {
    setEditingProduct(null);
  };

  // Delete a product
  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this product?')) {
      deleteProduct.mutate(id);
    }
  };

  // Add new product form handlers
  const handleNewProductChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = e.target.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value;
    setNewProduct({
      ...newProduct,
      [e.target.name]: value
    });
  };

  const handleCancelNew = () => {
    setIsAddingNew(false);
    setNewProduct({
      title: '', image: '', price: '', unit: '', description: '', full_description: '',
      ingredients: '', usage_instructions: '', stock_quantity: 0, min_stock_level: 10, max_stock_level: 100
    });
  };

  const handleSaveNew = () => {
    if (!newProduct.title || !newProduct.price || !newProduct.unit) {
      toast({
        title: "Missing information",
        description: "Please fill in at least the title, price, and unit fields.",
        variant: "destructive"
      });
      return;
    }

    const productToAdd = {
      ...newProduct,
      title: newProduct.title ?? '',
      image: newProduct.image ?? 'https://images.unsplash.com/photo-1550583724-b2692b85b150?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=800&q=80',
      price: newProduct.price ?? '0',
      unit: newProduct.unit ?? 'unit',
      description: newProduct.description ?? '',
      stock_quantity: newProduct.stock_quantity ?? 0,
      min_stock_level: newProduct.min_stock_level ?? 10,
      max_stock_level: newProduct.max_stock_level ?? 100
    };

    createProduct.mutate(productToAdd, {
      onSuccess: () => {
        setIsAddingNew(false);
        setNewProduct({ title: '', image: '', price: '', unit: '', description: '', full_description: '', ingredients: '', usage_instructions: '', stock_quantity: 0, min_stock_level: 10, max_stock_level: 100 });
      }
    });
  };

  // Toggle order expansion function
  const toggleOrderExpansion = (orderId: string) => {
    setExpandedOrderId(expandedOrderId === orderId ? null : orderId);
  };

  // Calculate sales data
  const calculateSalesData = (orders: Order[]) => {
    const salesByMonth: Record<string, number> = {};
    orders.forEach(order => {
      const month = format(new Date(order.created_at), 'MMM yyyy');
      salesByMonth[month] = (salesByMonth[month] || 0) + (order.total || 0);
    });

    const labels = Object.keys(salesByMonth);
    const data = Object.values(salesByMonth);

    return { labels, data };
  };

  // Calculate order statistics
  const calculateOrderStats = (orders: Order[]) => {
    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum, order) => sum + (order.total || 0), 0);
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    const statusCounts = orders.reduce((acc, order) => {
      acc[order.status] = (acc[order.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return { totalOrders, totalRevenue, averageOrderValue, statusCounts };
  };


  // ...existing code above...

const filteredOrders = useMemo(() => {
  let filtered = orders;

  // Filter by status
  if (statusFilter !== 'all') {
    filtered = filtered.filter(order => order.status === statusFilter);
  }

  // Filter by search term (order number, customer name, email, phone)
  if (searchTerm.trim() !== '') {
    const term = searchTerm.toLowerCase();
    filtered = filtered.filter(order =>
      (order.order_number && order.order_number.toLowerCase().includes(term)) ||
      (order.profiles?.name && order.profiles.name.toLowerCase().includes(term)) ||
      (order.customer_name && order.customer_name.toLowerCase().includes(term)) ||
      (order.profiles?.email && order.profiles.email.toLowerCase().includes(term)) ||
      (order.customer_email && order.customer_email.toLowerCase().includes(term)) ||
      (order.customer_phone && order.customer_phone.toLowerCase().includes(term))
    );
  }

  // Sort
  if (sortBy === 'date_desc') {
    filtered = filtered.slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  } else if (sortBy === 'date_asc') {
    filtered = filtered.slice().sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  } else if (sortBy === 'amount_desc') {
    filtered = filtered.slice().sort((a, b) => (b.total || 0) - (a.total || 0));
  } else if (sortBy === 'amount_asc') {
    filtered = filtered.slice().sort((a, b) => (a.total || 0) - (b.total || 0));
  }

  return filtered;
}, [orders, statusFilter, searchTerm, sortBy]);



  // Sales analytics component
  const SalesAnalytics = ({ orders }: { orders: Order[] }) => {
    const salesData = calculateSalesData(orders);
    const orderStats = calculateOrderStats(orders);

    const lineChartData = {
      labels: salesData.labels,
      datasets: [
        {
          label: 'Monthly Sales',
          data: salesData.data,
          fill: false,
          borderColor: 'rgb(75, 192, 192)',
          tension: 0.1,
        },
      ],
    };

    const lineChartOptions = {
      responsive: true,
      plugins: {
        legend: {
          position: 'top' as const,
        },
        title: {
          display: true,
          text: 'Monthly Sales Trend',
        },
      },
    };

    return (
    <div className="space-y-4 sm:space-y-6">
  {/* Sales Overview */}
  <div className="bg-white p-4 sm:p-6 rounded-lg shadow hover:shadow-md transition duration-300">
    <h3 className="text-lg font-semibold mb-4">Sales Overview</h3>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
      <div className="p-3 sm:p-4  rounded-lg bg-blue-100  border border-blue-300 hover:bg-blue-200 transition">
        <h4 className="text-sm font-medium text-blue-600">Total Orders</h4>
        <p className="text-xl sm:text-2xl font-bold">{orderStats.totalOrders}</p>
      </div>
      <div className="p-3 sm:p-4 bg-green-100 border border-green-300 rounded-lg hover:bg-green-200 transition">
        <h4 className="text-sm font-medium text-green-600">Total Revenue</h4>
        <p className="text-xl sm:text-2xl font-bold">₹{orderStats.totalRevenue.toFixed(2)}</p>
      </div>
      <div className="p-3 sm:p-4 bg-purple-100 border border-purple-300 rounded-lg hover:bg-purple-200 transition sm:col-span-2 lg:col-span-1">
        <h4 className="text-sm font-medium text-purple-600">Average Order Value</h4>
        <p className="text-xl sm:text-2xl font-bold">₹{orderStats.averageOrderValue.toFixed(2)}</p>
      </div>
    </div>
  </div>
  
  {/* Sales Trend */}
  <div className="bg-white p-4 sm:p-6 rounded-lg shadow hover:shadow-md transition duration-300">
    <h3 className="text-lg font-semibold mb-4">Sales Trend</h3>
    <div className="h-[250px] sm:h-[300px] lg:h-[400px] overflow-hidden">
      <Line data={lineChartData} options={lineChartOptions} />
    </div>
  </div>
  
  {/* Order Status Distribution */}
  <div className="bg-white p-4 sm:p-6 rounded-lg shadow hover:shadow-md transition duration-300">
    <h3 className="text-lg font-semibold mb-4">Order Status Distribution</h3>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 border border-blue-300 rounded-lg ">
      {Object.entries(orderStats.statusCounts).map(([status, count]) => (
        <div
          key={status} 
          className="p-3 sm:p-4 bg-gray-50 rounded-lg hover:bg-gray-100 hover:scale-[1.02] transition transform duration-200 ease-in-out"
        >
          
          <h4 className="text-sm font-medium text-gray-600 capitalize"> {status} payment  </h4>
          <p className="text-lg sm:text-xl font-bold">{count}</p> 
        </div>
      ))}
    </div>
  </div>
</div>
    );
  };

  return (
    <div className="container mx-auto py-10">
      <h1 className="text-3xl mt-9 font-bold mb-8">Admin Dashboard</h1>

      <Tabs defaultValue="products" className="w-full">
  
<TabsList className="grid w-full grid-cols-4 bg-gray-400 text-black text-xs sm:text-sm md:text-base gap-0.5 sm:gap-1 p-1" > 
  <TabsTrigger value="products"className="px-1 py-2 sm:px-1.3 sm:py-1.8 text-xs sm:text-sm font-medium truncate min-w-0"> Products </TabsTrigger> 
  <TabsTrigger  value="orders" className="px-1 py-2 sm:px-1.5 sm:py-1.8 text-xs sm:text-sm font-medium truncate min-w-0"> Orders</TabsTrigger> 
  <TabsTrigger value="users" className="px-1 py-2 sm:px-1.5 sm:py-1.8 text-xs sm:text-sm font-medium truncate min-w-0"> <span className="hidden sm:inline">Active Users</span>
    <span className="sm:hidden">Users</span>
  </TabsTrigger> 
  <TabsTrigger value="analytics" className="px-1 py-2 sm:px-1.5 sm:py-1.8 text-xs sm:text-sm font-medium truncate min-w-0"><span className="hidden sm:inline">Sale Analytics</span>
    <span className="sm:hidden">Analytics</span>
  </TabsTrigger> 
</TabsList>



<TabsContent value="products">
  <div className="bg-white rounded-lg shadow p-6">
    <div className="flex justify-between items-center mb-6">
      <h2 className="text-base md:text-xl lg:text-2xl font-semibold text-gray-800">Products & Stock Management</h2>
      {!isAddingNew && (
        <Button 
          onClick={() => {
            setIsAddingNew(true);
            setEditingProduct(null);
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm hidden md:flex"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add New Product
        </Button>
      )}
    </div>

    {/* Search Bar */}
    <div className="mb-6">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        <Input
          type="text"
          placeholder="Search products by name, unit, or description..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      {searchTerm && (
        <div className="mt-2 text-sm text-gray-600">
          {filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''} found
        </div>
      )}
    </div>

    {/* Mobile-only sub-tabs */}
    <div className="mb-6 md:hidden">
      <div className="flex justify-between bg-gray-100 p-1 rounded-md shadow-sm">
        <button
          onClick={() => setActiveMobileTab('overview')}
          className={`flex-1 text-xs md:text-sm font-medium py-2 px-2 whitespace-nowrap rounded-l-lg transition-all duration-200
            ${activeMobileTab === 'overview'
              ? 'bg-teal-500 shadow-md'
              : 'text-black bg-teal-100 hover:bg-blue-200'
            }`}
        >
          Stock Overview
        </button>
        <button
          onClick={() => setActiveMobileTab('manage')}
          className={`flex-1 text-xs md:text-sm font-medium py-2 px-2 whitespace-nowrap rounded-r-lg transition-all duration-200
            ${activeMobileTab === 'manage'
              ? 'bg-teal-500  shadow-md'
              : 'text-black bg-teal-100 hover:bg-blue-100'
            }`}
        >
          Manage Products
        </button>
      </div>
    </div>

    {/* Mobile Add Product Button - Only show in overview tab */}
    {!isAddingNew && (
      <div className="mb-4 md:hidden">
        {activeMobileTab === 'manage' && (
          <Button 
            onClick={() => {
               setActiveMobileTab('manage');
              setIsAddingNew(true);
              setEditingProduct(null);
            }}
            className="w-full bg-indigo-400 border border-indigo-500 hover:bg-blue-700 text-black shadow-sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add New Product
          </Button>
        )}
      </div>
    )}

    {/* Desktop: Show everything, Mobile: Show based on active tab */}
    <div className={`${activeMobileTab === 'overview' ? 'block' : 'hidden'} md:block`}>
      {/* Stock Alerts Section - Improved mobile design */}
      {lowStockProducts.length > 0 && (
        <div className="mb-6 p-3 md:p-4 bg-gradient-to-r from-yellow-100 to-orange-200 border border-black rounded-lg shadow-sm">
          <h3 className="text-base md:text-lg font-semibold mb-2 md:mb-3 flex items-center text-yellow-800">
            <AlertTriangle className="w-4 h-4 md:w-5 md:h-5 mr-2 text-yellow-600" />
            <span className="text-sm md:text-base">Stock Alerts ({lowStockProducts.length} items)</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-3">
            {lowStockProducts.map(product => (
              <div key={product.id} className="flex justify-between items-center p-2 md:p-3 bg-white rounded-lg shadow-sm border border-yellow-700">
                <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
                  <img
                    src={product.image}
                    alt={product.title}
                    className="w-8 h-8 md:w-10 md:h-10 object-cover rounded-md flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-gray-900 text-xs md:text-sm block truncate">{product.title}</span>
                    <div className="flex items-center gap-1 md:gap-2 mt-0.5 md:mt-1">
                      <span className="text-xs text-gray-600">{product.unit}</span>
                      <span className={`px-1.5 md:px-2 py-0.5 md:py-1 rounded-full text-xs font-medium ${getStockStatusColor(product.stock_status)}`}>
                        {product.stock_quantity}
                      </span>

                    </div>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleStockUpdate(product)}
                  className="text-xs bg-blue-500 hover:bg-blue-600 text-white border border-black rounded-lg p-1.5 md:p-2 shadow-sm flex-shrink-0 ml-2"
                >
                 
                  <Package className="w-3 h-3 md:w-4 md:h-4" />
                  {/* <span className="hidden sm:inline ml-1 text-xs">Restock</span> */}
                  {/* <span className="ml-1 text-xs">Restock</span> */}
                  <span className="ml-1 text-[10px] md:text-xs">Restock</span>
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>

    {/* Products Table - Desktop: Always visible, Mobile: Only in manage tab */}
    <div className={`${activeMobileTab === 'manage' ? 'block' : 'hidden'} md:block`}>
      {isAddingNew && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-4 md:p-6 border border-gray-900 rounded-lg bg-gray-300"
        >
          <h3 className="text-lg font-medium mb-4 text-gray-800">Add New Product</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 border-b border-gray-900 pb-4">
            <div>
              <label htmlFor="new-title" className="block text-sm font-medium mb-1 text-gray-700">Title *</label>
              <Input
                id="new-title"
                name="title"
                value={newProduct.title ?? ''}
                onChange={handleNewProductChange}
                placeholder="Product title"
                className="focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="new-image" className="block text-sm font-medium mb-1 text-gray-700">Image URL</label>
              <Input
                id="new-image"
                name="image"
                value={newProduct.image ?? ''}
                onChange={handleNewProductChange}
                placeholder="https://example.com/image.jpg"
                className="focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="new-price" className="block text-sm font-medium mb-1 text-black">Price (₹) *</label>
              <Input
                id="new-price"
                name="price"
                value={newProduct.price ?? ''}
                onChange={handleNewProductChange}
                placeholder="100"
                className="focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="new-unit" className="block text-sm font-medium mb-1 text-gray-700">Unit *</label>
              <Input
                id="new-unit"
                name="unit"
                value={newProduct.unit ?? ''}
                onChange={handleNewProductChange}
                placeholder="1 L, 500g, etc."
                className="focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Stock Management Fields */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div>
              <label htmlFor="new-stock-quantity" className="block text-sm font-medium mb-1 text-blue-800">Initial Stock Quantity</label>
              <Input
                id="new-stock-quantity"
                name="stock_quantity"
                type="number"
                min="0"
                value={newProduct.stock_quantity ?? 0}
                onChange={handleNewProductChange}
                placeholder="0"
                className="focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="new-min-stock" className="block text-sm font-medium mb-1 text-blue-800">Minimum Stock Level</label>
              <Input
                id="new-min-stock"
                name="min_stock_level"
                type="number"
                min="0"
                value={newProduct.min_stock_level ?? 10}
                onChange={handleNewProductChange}
                placeholder="10"
                className="focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="new-max-stock" className="block text-sm font-medium mb-1 text-blue-800">Maximum Stock Level</label>
              <Input
                id="new-max-stock"
                name="max_stock_level"
                type="number"
                min="0"
                value={newProduct.max_stock_level ?? 100}
                onChange={handleNewProductChange}
                placeholder="100"
                className="focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="mb-4">
            <label htmlFor="new-description" className="block text-sm font-medium mb-1 text-gray-700">Short Description</label>
            <Textarea
              id="new-description"
              name="description"
              value={newProduct.description ?? ''}
              onChange={handleNewProductChange}
              placeholder="Brief description for product card"
              rows={2}
              className="focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="mb-4">
            <label htmlFor="new-full-description" className="block text-sm font-medium mb-1 text-gray-700">Full Description</label>
            <Textarea
              id="new-full-description"
              name="full_description"
              value={newProduct.full_description ?? ''}
              onChange={handleNewProductChange}
              placeholder="Detailed description for product page"
              rows={3}
              className="focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label htmlFor="new-ingredients" className="block text-sm font-medium mb-1 text-gray-700">Ingredients</label>
              <Textarea
                id="new-ingredients"
                name="ingredients"
                value={newProduct.ingredients ?? ''}
                onChange={handleNewProductChange}
                placeholder="List of ingredients"
                rows={2}
                className="focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="new-usage" className="block text-sm font-medium mb-1 text-gray-700">Usage Instructions</label>
              <Textarea
                id="new-usage"
                name="usage_instructions"
                value={newProduct.usage_instructions ?? ''}
                onChange={handleNewProductChange}
                placeholder="How to use this product"
                rows={2}
                className="focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-3 pt-4 border-t border-gray-200">
            <Button
              onClick={handleSaveNew}
              disabled={createProduct.isPending}
              className="bg-green-600 hover:bg-green-700 text-white shadow-sm w-full md:w-auto"
            >
              <SaveIcon className="w-4 h-4 mr-2" />
              {createProduct.isPending ? 'Saving...' : 'Save Product'}
            </Button>
            <Button
              variant="outline"
              onClick={handleCancelNew}
              className="border-gray-300 hover:bg-gray-50 w-full md:w-auto"
            >
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
          </div>
        </motion.div>
      )}

      {productsLoading ? (
        <div className="text-center py-12">
          <div className="inline-flex items-center px-4 py-2 font-semibold leading-6 text-sm shadow rounded-md text-blue-500 bg-blue-100 transition ease-in-out duration-150">
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Loading products...
          </div>
        </div>
      ) : productsError ? (
        <div className="text-center py-12">
          <div className="text-red-600 bg-red-50 border border-red-200 rounded-lg p-4 inline-block">
            <AlertTriangle className="w-5 h-5 mx-auto mb-2" />
            Error loading products: {productsError.message}
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-900 shadow-sm">
          {/* Mobile: Card layout, Desktop: Table layout */}
          <div className="md:hidden">
            {filteredProducts.map((product, index) => (
            <div key={product.id} className="border-b-2 border-gray-300 p-4 bg-white shadow-sm">
  {editingProduct?.id === product.id ? (
    // --- MOBILE EDIT FORM ---
    <div>
      <div className="mb-2">
        <label className="block text-xs font-medium mb-1 text-gray-700">Title *</label>
        <Input
          name="title"
          value={editingProduct.title}
          onChange={handleEditChange}
          className="font-medium focus:ring-2 focus:ring-blue-500"
          placeholder="Product title"
        />
      </div>
      <div className="mb-2">
        <label className="block text-xs font-medium mb-1 text-gray-700">Price (₹) *</label>
        <Input
          name="price"
          value={editingProduct.price}
          onChange={handleEditChange}
          placeholder="100"
          className="focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div className="mb-2">
        <label className="block text-xs font-medium mb-1 text-gray-700">Unit *</label>
        <Input
          name="unit"
          value={editingProduct.unit}
          onChange={handleEditChange}
          placeholder="1 L, 500g, etc."
          className="focus:ring-2 focus:ring-blue-500"
        />
      </div>
      {/* Add more fields as needed */}
      <div className="flex gap-2 mt-3">
        <Button
          size="sm"
          onClick={handleSaveEdit}
          disabled={updateProduct.isPending}
          className="bg-green-600 hover:bg-green-700 text-white flex-1 text-xs px-2"
        >
          <SaveIcon className="w-3 h-3 mr-1" />
          Save
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleCancelEdit}
          className="border-gray-300 flex-1 text-xs px-2"
        >
          <X className="w-3 h-3 mr-1" />
          Cancel
        </Button>
      </div>
    </div>
  ) : (
    // --- NORMAL PRODUCT CARD ---
    <>
      <div className="flex items-start gap-3 mb-3">
        <img
          src={product.image}
          alt={product.title}
          className="w-16 h-16 object-cover rounded-lg shadow-sm flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-gray-900 mb-1 text-sm leading-tight">{product.title}</h3>
          <div className="text-xs text-gray-600 mb-2">{product.unit}</div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getStockStatusColor(product.stock_status)}`}>
              {product.stock_status === 'in_stock' ? '✓ In Stock' :
                product.stock_status === 'low_stock' ? '⚠ Low Stock' : '✗ Out of Stock'}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-gray-50 p-2 rounded">
          <div className="text-xs text-gray-500">Price</div>
          <div className="font-semibold text-gray-900 text-sm">₹{product.price}</div>
        </div>
        <div className="bg-gray-50 p-2 rounded">
          <div className="text-xs text-gray-500">Stock</div>
          <div className="font-semibold text-gray-900 text-sm">{product.stock_quantity}</div>
        </div>
      </div>

      {/* Stock Action Buttons */}
      <div className="flex gap-2 mb-3">
        <Button
          size="sm"
          onClick={() => handleStockSave('add10', product)}
          className="bg-green-500 hover:bg-green-600 text-white flex-1 text-xs px-2 py-1.5"
        >
          <Plus className="w-3 h-3 mr-1" />
          Add 10 
        </Button>
        <Button
          size="sm"
          onClick={() => handleStockUpdate(product)}
          className="bg-blue-400 hover:bg-blue-500 border-black text-black flex-1 text-xs px-2 py-1.5"
        >
          <Package className="w-3 h-3 mr-1" />
          Stock
        </Button>
      </div>

      {/* Product Action Buttons */}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleEdit(product)}
          className="border-blue-900 text-blue-600 bg-slate-300 hover:bg-blue-500 flex-1 text-xs px-2 py-1.5"
        >
          <Pencil className="w-3 h-3 mr-1" />
          Edit
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => handleDeleteClick(product.id)}
          className="bg-red-600 hover:bg-red-600 hover:text-black shadow-sm flex-1 text-xs px-2 py-1.5"
        >
          <Trash2 className="w-3 h-3 mr-1" />
          Delete 
        </Button>
      </div>
    </>
  )}
</div>
          ))}
          </div>

          {/* Desktop Table Layout */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-400 hover:bg-gray-500 transition-colors">
                  <TableHead className="font-bold text-black">Product</TableHead>
                  <TableHead className="font-bold text-black">Price & Quantity</TableHead>
                  <TableHead className="font-bold text-black text-center">Stock Management</TableHead>
                  <TableHead className="font-bold text-black text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((product, index) => (
                  <TableRow
                    key={product.id}
                    className={`${
                      index % 2 === 0 ? 'bg-white' : 'hover:bg-gray-500'
                    } hover:bg-blue-50 transition-colors border border-gray-900 rounded-md shadow-sm`}
                  >
                    <TableCell className="py-4">
                      <div className="flex items-start gap-4">
                        <img
                          src={product.image}
                          alt={product.title}
                          className="w-16 h-16 object-cover rounded-lg shadow-sm"
                        />
                        <div className="flex-1 min-w-0">
                          {editingProduct?.id === product.id ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <label className="block text-xs font-medium mb-1 text-gray-700">Title *</label>
                                <Input
                                  name="title"
                                  value={editingProduct.title}
                                  onChange={handleEditChange}
                                  className="font-medium focus:ring-2 focus:ring-blue-500"
                                  placeholder="Product title"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium mb-1 text-gray-700">Image URL</label>
                                <Input
                                  name="image"
                                  value={editingProduct.image}
                                  onChange={handleEditChange}
                                  placeholder="https://example.com/image.jpg"
                                  className="focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium mb-1 text-gray-700">Price (₹) *</label>
                                <Input
                                  name="price"
                                  value={editingProduct.price}
                                  onChange={handleEditChange}
                                  placeholder="100"
                                  className="focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium mb-1 text-gray-700">Unit *</label>
                                <Input
                                  name="unit"
                                  value={editingProduct.unit}
                                  onChange={handleEditChange}
                                  placeholder="1 L, 500g, etc."
                                  className="focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                              <div className="md:col-span-2">
                                <label className="block text-xs font-medium mb-1 text-gray-700">Short Description</label>
                                <Textarea
                                  name="description"
                                  value={editingProduct.description || ''}
                                  onChange={handleEditChange}
                                  placeholder="Brief description for product card"
                                  rows={2}
                                  className="focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                              <div className="md:col-span-2">
                                <label className="block text-xs font-medium mb-1 text-gray-700">Full Description</label>
                                <Textarea
                                  name="full_description"
                                  value={editingProduct.full_description || ''}
                                  onChange={handleEditChange}
                                  placeholder="Detailed description for product page"
                                  rows={3}
                                  className="focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium mb-1 text-gray-700">Ingredients</label>
                                <Textarea
                                  name="ingredients"
                                  value={editingProduct.ingredients || ''}
                                  onChange={handleEditChange}
                                  placeholder="List of ingredients"
                                  rows={2}
                                  className="focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium mb-1 text-gray-700">Usage Instructions</label>
                                <Textarea
                                  name="usage_instructions"
                                  value={editingProduct.usage_instructions || ''}
                                  onChange={handleEditChange}
                                  placeholder="How to use this product"
                                  rows={2}
                                  className="focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium mb-1 text-blue-800">Stock Quantity</label>
                                <Input
                                  name="stock_quantity"
                                  type="number"
                                  min="0"
                                  value={editingProduct.stock_quantity}
                                  onChange={handleEditChange}
                                  placeholder="0"
                                  className="focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium mb-1 text-blue-800">Min Stock Level</label>
                                <Input
                                  name="min_stock_level"
                                  type="number"
                                  min="0"
                                  value={editingProduct.min_stock_level}
                                  onChange={handleEditChange}
                                  placeholder="10"
                                  className="focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium mb-1 text-blue-800">Max Stock Level</label>
                                <Input
                                  name="max_stock_level"
                                  type="number"
                                  min="0"
                                  value={editingProduct.max_stock_level}
                                  onChange={handleEditChange}
                                  placeholder="100"
                                  className="focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                            </div>
                          ) : (
                            <div>
                              <h3 className="font-bold text-gray-900 mb-1">{product.title}</h3>
                              <div className="text-xs text-gray-500">{product.unit}</div>
                              <div className="flex items-center gap-2 mt-2">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStockStatusColor(product.stock_status)}`}>
                                  {product.stock_status === 'in_stock' ? '✓ In Stock' :
                                    product.stock_status === 'low_stock' ? '⚠ Low Stock' : '✗ Out of Stock'}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>

                    <TableCell className="py-4">
                      {editingProduct?.id === product.id ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-1">
                            <span className="text-black">₹</span>
                            <Input
                              name="price"
                              value={editingProduct.price}
                              onChange={handleEditChange}
                              className="w-20 focus:ring-2 focus:ring-blue-500"
                              placeholder="Price"
                            />
                          </div>
                          <Input
                            name="unit"
                            value={editingProduct.unit}
                            onChange={handleEditChange}
                            className="w-24 focus:ring-2 focus:ring-blue-500"
                            placeholder="Unit"
                          />
                        </div>
                      ) : (
                        <div>
                          <div className="font-semibold text-gray-900">₹{product.price}</div>
                          <div className="text-sm text-gray-600">{product.unit} available</div>
                        </div>
                      )}
                    </TableCell>

                    <TableCell className="py-4">
                      <div className="text-center">
                        {editingProduct?.id === product.id ? (
                          <div className="space-y-2">
                            <div className="flex items-center justify-center gap-2">
                              <span className="text-sm text-gray-600">Qty:</span>
                              <Input
                                name="stock_quantity"
                                type="number"
                                min="0"
                                value={editingProduct.stock_quantity}
                                onChange={handleEditChange}
                                className="w-20 text-center focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                            <div className="text-xs text-gray-500">
                              Min: {editingProduct.min_stock_level} | Max: {editingProduct.max_stock_level}
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex items-center justify-center gap-3">
                              <div className="text-center">
                                <div className="text-2xl font-bold text-gray-900">{product.stock_quantity}</div>
                                <div className="text-xs text-gray-500">{product.unit}</div>
                              </div>
                              <div className="flex flex-col gap-1">
                                <Button
                                  size="sm"
                                  onClick={() => handleStockSave('add10', product)}
                                  className="bg-green-500 hover:bg-green-600 text-white h-8 px-2"
                                  title="Add 10 Instantly"
                                >
                                  <Plus className="w-3 h-3 mr-1" />
                                  Add 10
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => handleStockUpdate(product)}
                                  className="bg-blue-400 hover:bg-blue-500 border-black h-8 px-2 text-black"
                                  title="Modify Stock"
                                >
                                  <Package className="w-3 h-3 mr-1" />
                                  Modify
                                </Button>
                              </div>
                            </div>
                            <div className="text-xs text-gray-500">
                              Min: {product.min_stock_level} | Max: {product.max_stock_level}
                            </div>
                          </div>
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="py-4">
                      <div className="flex flex-col items-center gap-2">
                        {editingProduct?.id === product.id ? (
                          <>
                            <Button
                              size="sm"
                              onClick={handleSaveEdit}
                              disabled={updateProduct.isPending}
                              className="bg-green-600 hover:bg-green-700 text-white shadow-sm"
                            >
                              <SaveIcon className="w-4 h-4 mr-1" />
                              Save Changes
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleCancelEdit}
                              className="border-gray-300 bg-red-400 hover:bg-red-500"
                            >
                              <X className="w-4 h-4 mr-1" />
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEdit(product)}
                              className="border-blue-900 text-blue-600 bg-slate-300 hover:bg-blue-500"
                            >
                              <Pencil className="w-4 h-4 mr-1" />
                              Modify Product
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDeleteClick(product.id)}
                              className="bg-red-600 hover:bg-red-600 hover:text-black shadow-sm"
                            >
                              <Trash2 className="w-4 h-4 mr-1" />
                              Delete Product
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>

    {/* Stock Update Modal */}
 {stockUpdateProduct && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 sm:p-6">
    <div className="bg-white rounded-2xl w-full max-w-sm sm:max-w-md mx-auto p-5 sm:p-6 shadow-2xl 
                    transform transition-all duration-300 scale-100 
                    max-h-[85vh] sm:max-h-[90vh] overflow-y-auto
                    border border-gray-200">
      
      {/* Header */}
      <div className="text-center mb-5">
        <h3 className="text-lg sm:text-xl font-bold text-gray-800 mb-2 leading-tight">
          Update Stock
        </h3>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
          <p className="text-sm font-medium text-blue-800 truncate">
            {stockUpdateProduct.title}
          </p>
          <p className="text-xs text-blue-600 mt-1">
            Current Stock: <span className="font-semibold">{stockUpdateProduct.stock_quantity}</span> {stockUpdateProduct.unit}
          </p>
        </div>
      </div>

      {/* Quantity Input */}
      <div className="mb-6">
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Quantity
        </label>
        <Input
          type="number"
          min="0"
          value={stockUpdateQuantity}
          onChange={(e) => setStockUpdateQuantity(parseInt(e.target.value) || 0)}
          placeholder="Enter quantity"
          className="w-full h-12 text-center text-lg font-medium border-2 border-gray-300 
                     rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 
                     transition-all duration-200"
        />
      </div>

      {/* Action Buttons */}
      <div className="space-y-3 mb-4">
        <div className="grid grid-cols-2 gap-3">
          <Button
            onClick={() => handleStockSave('add')}
            disabled={updateStock.isPending}
            className="bg-green-500 hover:bg-green-600 text-white h-11 rounded-xl 
                       font-medium shadow-md hover:shadow-lg transition-all duration-200
                       flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Stock
          </Button>
          <Button
            onClick={() => handleStockSave('subtract')}
            disabled={updateStock.isPending}
            className="bg-orange-500 hover:bg-orange-600 text-white h-11 rounded-xl 
                       font-medium shadow-md hover:shadow-lg transition-all duration-200
                       flex items-center justify-center gap-2"
          >
            <Minus className="w-4 h-4" />
            Remove
          </Button>
        </div>
        
        <div className="grid grid-cols-2 gap-3">
          <Button
            onClick={() => handleStockSave('set')}
            disabled={updateStock.isPending}
            className="bg-blue-500 hover:bg-blue-600 text-white h-11 rounded-xl 
                       font-medium shadow-md hover:shadow-lg transition-all duration-200"
          >
            Set Exact
          </Button>
          <Button
            onClick={() => handleStockSave('add10')}
            disabled={updateStock.isPending}
            className="bg-purple-500 hover:bg-purple-600 text-white h-11 rounded-xl 
                       font-medium shadow-md hover:shadow-lg transition-all duration-200"
          >
            Quick +10
          </Button>
        </div>
      </div>

      {/* Out of Stock Button */}
      <Button
        onClick={() => {
          setStockUpdateQuantity(0);
          handleStockSave('set');
        }}
        disabled={updateStock.isPending}
        className="w-full bg-red-500 hover:bg-red-600 text-white h-11 rounded-xl 
                   font-medium shadow-md hover:shadow-lg transition-all duration-200 mb-4"
      >
        Mark Out of Stock
      </Button>

      {/* Cancel Button */}
      <Button
        variant="outline"
        onClick={() => {
          setStockUpdateProduct(null);
          setStockUpdateQuantity(0);
        }}
        className="w-full h-11 rounded-xl border-2 border-gray-300 hover:border-gray-400 
                   hover:bg-gray-50 font-medium transition-all duration-200"
      >
        Cancel
      </Button>
    </div>
  </div>
)}

  </div>
</TabsContent>




<ConfirmDialog
  open={confirmOpen}
  onOpenChange={setConfirmOpen}
  onConfirm={handleConfirmDelete}
  title="⚠️ Delete this product?"
  description="Are you sure you want to delete this product? This action cannot be undone."
/>

{/* <------------orders tab --------------> */}
        <TabsContent value="orders">
  <div className="bg-white border border-black rounded-lg shadow p-3 sm:p-6">
    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 sm:mb-6 gap-3">
      <h2 className="text-lg sm:text-2xl font-semibold">Order Management</h2>
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
        <select
          className="px-3 py-2 text-xs sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All Status</option>
          <option value="pending">Pending Payemnt</option>
          <option value="completed">Completed Payement</option>
          <option value="cancelled">Cancelled Orders</option>
        </select>
        <select
          className="px-3 py-2 text-xs sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
        >
          <option value="date_desc">Newest Order</option>
          <option value="date_asc">Oldest Order</option>
          <option value="amount_desc">Highest Price</option>
          <option value="amount_asc">Lowest Price</option>
        </select>
      </div>
    </div>
 
    {/* Order Statistics */}
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 mb-4 sm:mb-6">
      <div className="p-2 sm:p-4 bg-blue-100 border border-blue-600 rounded-lg hover:bg-blue-200 transition">
        <h4 className="text-xs sm:text-sm font-medium text-blue-600">Total Orders</h4>
        <p className="text-lg sm:text-2xl font-bold">{orderStats.totalOrders}</p>
      </div>
      <div className="p-2 sm:p-4 bg-green-100 border border-green-600 rounded-lg hover:bg-green-200 transition">
        <h4 className="text-xs sm:text-sm font-medium text-green-600">Total Revenue</h4>
        <p className="text-lg sm:text-2xl font-bold">₹{orderStats.totalRevenue.toFixed(2)}</p>
      </div>
      <div className="p-2 sm:p-4 bg-purple-200 border border-purple-600 rounded-lg hover:bg-purple-300 transition">
        <h4 className="text-xs sm:text-sm font-medium text-purple-600">Avg Order</h4>
        <p className="text-lg sm:text-2xl font-bold">₹{orderStats.averageOrderValue.toFixed(2)}</p>
      </div>
      <div className="p-2 sm:p-4 bg-orange-100 border border-orange-500 rounded-lg hover:bg-yellow-100 transition">
        <h4 className="text-xs sm:text-sm font-bold text-orange-600">Status Count</h4>
        <div className="text-xs sm:text-sm">
          {Object.entries(orderStats.statusCounts).map(([status, count]) => (
            <div key={status} className="flex justify-between">
              <span className="capitalize">{status}: {count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>

   {ordersLoading ? (
  <div className="text-center py-8">Loading orders...</div>
) : ordersError ? (
  <div className="text-center py-8 text-red-600">
    Error loading orders: {ordersError.message}
  </div>
) : filteredOrders.length === 0 ? (
  <div className="text-center py-8 text-gray-500">No orders found</div>
) : (
  <div className="space-y-3 sm:space-y-4 bg-gray-300 border border-black rounded-lg shadow p-3 sm:p-6">
    {filteredOrders.map((order) => (
          <motion.div
            key={order.id}
            initial={{ opacity: 1, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`border-l-4 rounded-lg p-3 sm:p-4 transition-all duration-300 shadow-md cursor-pointer ${
              expandedOrderId === order.id
                ? ' text-black bg-blue-50 border-blue-200 '
                : 'bg-white border-gray-200 hover:bg-gray-200 hover:border-pink-200'
            }`}
            onClick={() => toggleOrderExpansion(order.id)}>
            
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
              {/* Mobile: Stack vertically, Desktop: Side by side */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm sm:text-base truncate">
                      Order #{order.order_number || order.id.slice(0, 8)}
                    </h3>
                    <p className="text-xs sm:text-sm text-black truncate">
                      {order.profiles?.name || order.customer_name || 'Unknown Customer'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {format(new Date(order.created_at), 'MMM dd, yyyy HH:mm')}
                    </p>
                  </div>
                  
                  {/* Price and Status */}
                  <div className="flex flex-col items-end ml-2">
                    <p className="font-medium text-sm">₹{order.total?.toFixed(2) || '0.00'}</p>
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      order.status === 'completed' ? 'bg-green-100 text-green-800' :
                      order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                      order.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {order.status}
                    </span>
                  </div>
                </div>
              </div>
              
              {/* Expand Indicator - Desktop only */}
              <div className="hidden sm:flex items-center">
                {expandedOrderId === order.id ? (
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </div>
            </div>

            {/* Mobile Expand Indicator */}
            <div className="flex justify-center sm:hidden mt-2 pt-2 border-t border-gray-100">
              <div className="flex items-center gap-1 text-blue-600">
                {expandedOrderId === order.id ? (
                  <>
                    <span className="text-xs">Hide Details</span>
                    <ChevronUp className="w-3 h-3" />
                  </>
                ) : (
                  <>
                    <span className="text-xs">Tap to view details</span>
                    <ChevronDown className="w-3 h-3" />
                  </>
                )}
              </div>
            </div>

            {expandedOrderId === order.id && (
              <motion.div
                animate={{ height: 'auto', opacity: 1 }}
                className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t"
              >
                <div className="grid grid-cols-1 gap-4 mb-4">
                  {/* Mobile: Stack all info vertically */}
                  <div className="space-y-3 sm:hidden">
                    <div className="bg-gray-50 rounded-lg p-3">
                      <h4 className="font-medium mb-2 text-sm">Customer Info</h4>
                      <div className="space-y-1">
                        <p className="text-xs"><strong>Name:</strong> {order.profiles?.name || order.customer_name || 'N/A'}</p>
                        <p className="text-xs"><strong>Email:</strong> {order.profiles?.email || order.customer_email || 'N/A'}</p>
                        <p className="text-xs"><strong>Phone:</strong> {order.customer_phone || 'N/A'}</p>
                      </div>
                    </div>
                    
                    <div className="bg-gray-50 rounded-lg p-3">
                      <h4 className="font-medium mb-2 text-sm">Delivery Info</h4>
                      <div className="space-y-1">
                        <p className="text-xs"><strong>Address:</strong> {order.delivery_address || 'N/A'}</p>
                        <p className="text-xs"><strong>City:</strong> {order.delivery_city || 'N/A'}</p>
                        <p className="text-xs"><strong>State:</strong> {order.delivery_state || 'N/A'}</p>
                        <p className="text-xs"><strong>ZIP:</strong> {order.delivery_zip_code || 'N/A'}</p>
                      </div>
                    </div>
                  </div>
                  
                  {/* Desktop: Two column layout */}
                  <div className="hidden sm:grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-medium mb-2">Customer Information</h4>
                      <p className="text-sm"><strong>Name:</strong> {order.profiles?.name || order.customer_name || 'N/A'}</p>
                      <p className="text-sm"><strong>Email:</strong> {order.profiles?.email || order.customer_email || 'N/A'}</p>
                      <p className="text-sm"><strong>Phone:</strong> {order.customer_phone || 'N/A'}</p>
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">Delivery Information</h4>
                      <p className="text-sm"><strong>Address:</strong> {order.delivery_address || 'N/A'}</p>
                      <p className="text-sm"><strong>City:</strong> {order.delivery_city || 'N/A'}</p>
                      <p className="text-sm"><strong>State:</strong> {order.delivery_state || 'N/A'}</p>
                      <p className="text-sm"><strong>ZIP:</strong> {order.delivery_zip_code || 'N/A'}</p>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium mb-2 text-sm sm:text-base">Order Items</h4>
                  {order.order_items && order.order_items.length > 0 ? (
                    <div className="space-y-2">
                      {order.order_items.map((item) => (
                        <div key={item.id} className="flex justify-between items-center p-2 sm:p-3 bg-gray-50 rounded">
                          <div className="flex items-center space-x-2 sm:space-x-3 flex-1 min-w-0">
                            {item.products?.image && (
                              <img
                                src={item.products.image}
                                alt={item.products.title}
                                className="w-8 h-8 sm:w-10 sm:h-10 object-cover rounded flex-shrink-0"
                              />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-xs sm:text-sm truncate">{item.products?.title || 'Unknown Product'}</p>
                              <p className="text-xs text-gray-600">Qty: {item.quantity}</p>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0 ml-2">
                            <p className="font-medium text-xs sm:text-sm">₹{item.price?.toFixed(2) || '0.00'}</p>
                            <p className="text-xs text-gray-500">
                              Total: ₹{((item.price || 0) * item.quantity).toFixed(2)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-xs sm:text-sm">No items found for this order</p>
                  )}
                </div>

                <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                    <div className="space-y-1">
                      <p className="text-xs sm:text-sm"><strong>Payment Method:</strong> {order.payment_method || 'N/A'}</p>
                      {order.cancelled_at && (
                        <p className="text-xs sm:text-sm text-red-600">
                          <strong>Cancelled:</strong> {format(new Date(order.cancelled_at), 'MMM dd, yyyy HH:mm')}
                          {order.cancellation_reason && (
                            <span className="block">Reason: {order.cancellation_reason}</span>
                          )}
                        </p>
                      )}
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-base sm:text-lg font-bold">Total: ₹{order.total?.toFixed(2) || '0.00'}</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </motion.div>
        ))}
      </div>
    )}
  </div>
</TabsContent>

<TabsContent value="users">
  <div className="bg-gray-200 border border-gray-500 rounded-lg p-2 sm:p-4 bg-white shadow-sm">
    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-3 sm:mb-4 md:mb-6 gap-3">
      <h2 className="text-lg sm:text-xl md:text-2xl font-semibold text-gray-800">Users Management</h2>
      <div className="relative">
        <input
          type="text"
          placeholder="Search by name, email, or ID..."
          className="w-full sm:w-64 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <svg className="absolute right-3 top-2.5 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
    </div>
    {profilesLoading ? (
      <div className="text-center py-8 text-gray-500">Loading users...</div>
    ) : (
      <>
        {/* Mobile Card View */}
        <div className="block sm:hidden space-y-3">
          {profiles.map((profile) => (
            <div key={profile.id} className="bg-white border border-gray-300 rounded-lg p-3 shadow-sm">
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm text-gray-900 truncate">
                    {profile.name || 'No name'}
                  </h3>
                  <p className="text-xs text-gray-500 truncate">{profile.email}</p>
                  <div className="flex items-center gap-1 mt-1">
                    <p className="text-xs text-gray-400 font-mono">{profile.id}</p>
                    <button
                      onClick={() => navigator.clipboard.writeText(profile.id)}
                      className="p-1 hover:bg-gray-100 rounded transition-colors"
                      title="Copy ID"
                    >
                      <svg className="h-3 w-3 text-gray-400 hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="mt-3 pt-2 border-t border-gray-100">
                 <div className="flex items-center gap-2">
                  <p className="text-xs font-medium text-gray-600">Contact:</p>
                  <p className="text-xs text-gray-800">{profile.phone || 'No phone'}</p>
                </div>
              </div>
              
              {profile.address && (
                <div className="mt-2 pt-2 border-t border-gray-100">
                  <p className="text-xs font-medium text-gray-600 mb-1">Address</p>
                  <p className="text-xs text-gray-800 leading-relaxed">
                    {profile.address}
                    <br />
                    {profile.city}, {profile.state} {profile.zip_code}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Desktop Table View */}
        <div className="hidden sm:block overflow-x-auto border border-gray-200 rounded-lg">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-500 border border-gray-500">
                <TableHead className="text-left font-semibold text-gray-900 px-2 py-3">User Info</TableHead>
                <TableHead className="text-center font-semibold text-gray-900 px-2 py-3">Contact</TableHead>
                <TableHead className="text-center font-semibold text-gray-900 px-2 py-3">Address</TableHead>
                <TableHead className="text-center font-semibold text-gray-900 px-2 py-3">Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
                {filteredProfiles.map((profile) => (
                <TableRow key={profile.id} className="hover:bg-gray-50 border-b border-gray-600">
                  <TableCell className="p-2 sm:p-3">
                    <div className="space-y-1">
                      <div className="font-medium text-sm">{profile.name || 'No name'}</div>
                      <div className="text-xs text-gray-500">{profile.email}</div>
                      <div className="flex items-center gap-1">
                        <div className="text-xs text-gray-400 font-mono">{profile.id}</div>
                        <button
                          onClick={() => navigator.clipboard.writeText(profile.id)}
                          className="p-1 hover:bg-gray-100 rounded transition-colors"
                          title="Copy ID"
                        >
                          <svg className="h-3 w-3 text-gray-400 hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-center text-sm p-2 sm:p-3">
                    <div className="space-y-1">
                      <div>{profile.phone || 'No phone'}</div>
                      <div className="text-xs text-gray-500">{profile.email}</div>
                    </div>
                  </TableCell>
                  <TableCell className="text-center text-sm p-2 sm:p-3">
                    {profile.address ? (
                      <div className="space-y-1">
                        <div className="text-xs sm:text-sm">{profile.address}</div>
                        <div className="text-xs text-gray-500">
                          {profile.city}, {profile.state} {profile.zip_code}
                        </div>
                      </div>
                    ) : (
                      <span className="text-gray-400">No address</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center text-xs text-gray-600 p-2 sm:p-3">
                    {format(new Date(profile.created_at), 'MMM dd, yyyy')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </>
    )}
  </div>
</TabsContent>
  {/* <----------------Analytics Tab ----------------> */}
        <TabsContent value="analytics">
          <SalesAnalytics orders={orders} />
        </TabsContent>
      </Tabs>


      
    </div>
  );
};

export default Admin;

