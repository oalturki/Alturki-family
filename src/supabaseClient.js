import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://xvbilckeuihurozfshzg.supabase.co";
const supabaseKey = "sb_publishable_iS95LUZ314blsxh15oP4BA_jxIYhm8l";

export const supabase = createClient(supabaseUrl, supabaseKey);
